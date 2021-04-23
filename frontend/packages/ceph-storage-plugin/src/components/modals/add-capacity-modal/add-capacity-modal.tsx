import * as React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import * as classNames from 'classnames';
import { Form, FormGroup, TextInput, TextContent } from '@patternfly/react-core';
import { humanizeBinaryBytes } from '@console/internal/components/utils/index';
import {
  createModalLauncher,
  ModalTitle,
  ModalSubmitFooter,
  ModalBody,
} from '@console/internal/components/factory';
import { usePrometheusPoll } from '@console/internal/components/graphs/prometheus-poll-hook';
import { k8sPatch, StorageClassResourceKind } from '@console/internal/module/k8s';
import { getName, getRequestedPVCSize } from '@console/shared';
import { FieldLevelHelp } from '@console/internal/components/utils/field-level-help';
import { OCSServiceModel } from '../../../models';
import { getCurrentDeviceSetIndex } from '../../../utils/add-capacity';
import { OSD_CAPACITY_SIZES } from '../../../utils/osd-size-dropdown';
import {
  NO_PROVISIONER,
  OCS_DEVICE_SET_ARBITER_REPLICA,
  OCS_DEVICE_SET_REPLICA,
  requestedCapacityTooltip,
  storageClassTooltip,
  defaultRequestSize,
} from '../../../constants';
import { OCSStorageClassDropdown } from '../storage-class-dropdown';
import { PVsAvailableCapacity } from '../../ocs-install/pvs-available-capacity';
import { createDeviceSet } from '../../ocs-install/ocs-request-data';
import { cephCapacityResource } from '../../../resources';
import { DeviceSet } from '../../../types';
import './add-capacity-modal.scss';
import { checkArbiterCluster, checkFlexibleScaling } from '../../../utils/common';

const getProvisionedCapacity = (value: number) => (value % 1 ? (value * 3).toFixed(2) : value * 3);

export const AddCapacityModal = (props: AddCapacityModalProps) => {
  const { t } = useTranslation();

  const { ocsConfig, close, cancel } = props;
  const deviceSets: DeviceSet[] = ocsConfig?.spec.storageDeviceSets || [];

  const [response, loadError, loading] = usePrometheusPoll(cephCapacityResource);
  const [storageClass, setStorageClass] = React.useState<StorageClassResourceKind>(null);
  /* TBD(Afreen): Show installation storage class as preselected
                  Change state metadata
  */
  const [inProgress, setProgress] = React.useState(false);
  const [errorMessage, setError] = React.useState('');

  const cephCapacity: string = response?.data?.result?.[0]?.value[1];
  const osdSizeWithUnit = getRequestedPVCSize(deviceSets[0].dataPVCTemplate);
  const osdSizeWithoutUnit: number = OSD_CAPACITY_SIZES[osdSizeWithUnit];
  const provisionedCapacity = getProvisionedCapacity(osdSizeWithoutUnit);
  const isNoProvionerSC: boolean = storageClass?.provisioner === NO_PROVISIONER;
  const selectedSCName: string = getName(storageClass);
  const deviceSetIndex: number = getCurrentDeviceSetIndex(deviceSets, selectedSCName);
  const hasFlexibleScaling = checkFlexibleScaling(ocsConfig);
  const isArbiterEnabled: boolean = checkArbiterCluster(ocsConfig);
  const replica = isArbiterEnabled ? OCS_DEVICE_SET_ARBITER_REPLICA : OCS_DEVICE_SET_REPLICA;
  const name = getName(ocsConfig);

  let currentCapacity: React.ReactNode;

  if (loading) {
    currentCapacity = (
      <div className="skeleton-text ceph-add-capacity__current-capacity--loading" />
    );
  } else if (loadError || !cephCapacity || !osdSizeWithoutUnit || deviceSetIndex === -1) {
    currentCapacity = <div className="text-muted">{t('ceph-storage-plugin~Not available')}</div>;
  } else {
    currentCapacity = (
      <div className="text-muted">
        <strong>{`${humanizeBinaryBytes(Number(cephCapacity) / replica).string} / ${deviceSets[
          deviceSetIndex
        ].count * osdSizeWithoutUnit} TiB`}</strong>
      </div>
    );
  }

  const onChange = (sc: StorageClassResourceKind) => setStorageClass(sc);

  const submit = (event: React.FormEvent<EventTarget>) => {
    event.preventDefault();
    setProgress(true);
    const patch = {
      op: '',
      path: '',
      value: null,
    };
    const osdSize = isNoProvionerSC ? defaultRequestSize.BAREMETAL : osdSizeWithUnit;
    let portable = !isNoProvionerSC;
    let deviceSetReplica = replica;
    let deviceSetCount = 1;

    if (deviceSetIndex === -1) {
      if (hasFlexibleScaling) {
        portable = false;
        deviceSetReplica = 1;
      }
      patch.op = 'add';
      patch.path = `/spec/storageDeviceSets/-`;
      patch.value = createDeviceSet(
        selectedSCName,
        osdSize,
        portable,
        deviceSetReplica,
        deviceSetCount,
      );
    } else {
      if (hasFlexibleScaling) deviceSetCount = 3;
      patch.op = 'replace';
      patch.path = `/spec/storageDeviceSets/${deviceSetIndex}/count`;
      patch.value = deviceSets[deviceSetIndex].count + deviceSetCount;
    }

    if (!selectedSCName) {
      setError(t('ceph-storage-plugin~No StorageClass selected'));
      setProgress(false);
    } else {
      k8sPatch(OCSServiceModel, ocsConfig, [patch])
        .then(() => {
          setProgress(false);
          close();
        })
        .catch((err) => {
          setError(err);
          setProgress(false);
        });
    }
  };

  return (
    <Form
      onSubmit={submit}
      className="pf-u-display-block modal-content modal-content--no-inner-scroll"
    >
      <ModalTitle>{t('ceph-storage-plugin~Add Capacity')}</ModalTitle>
      <ModalBody>
        <Trans t={t} ns="ceph-storage-plugin" values={{ name }}>
          Adding capacity for <strong>{{ name }}</strong>, may increase your expenses.
        </Trans>
        <FormGroup
          className="pf-u-pt-md pf-u-pb-sm"
          id="add-cap-sc-dropdown__FormGroup"
          fieldId="add-capacity-dropdown"
          label={t('ceph-storage-plugin~Storage Class')}
          labelIcon={<FieldLevelHelp>{storageClassTooltip(t)}</FieldLevelHelp>}
          isRequired
        >
          <div id="add-capacity-dropdown" className="ceph-add-capacity__sc-dropdown">
            <OCSStorageClassDropdown onChange={onChange} data-test="add-cap-sc-dropdown" />
          </div>
        </FormGroup>
        {isNoProvionerSC ? (
          <PVsAvailableCapacity
            replica={replica}
            data-test-id="ceph-add-capacity-pvs-available-capacity"
            storageClass={storageClass}
          />
        ) : (
          <>
            <FormGroup
              className="pf-u-py-sm"
              fieldId="request-size"
              id="requestSize__FormGroup"
              label={t('ceph-storage-plugin~Raw Capacity')}
              labelIcon={<FieldLevelHelp>{requestedCapacityTooltip(t)}</FieldLevelHelp>}
            >
              <TextInput
                isDisabled
                id="request-size"
                className={classNames('pf-c-form-control', 'ceph-add-capacity__input')}
                type="number"
                name="requestSize"
                value={osdSizeWithoutUnit}
                aria-label="requestSize"
                data-test-id="requestSize"
              />
              {provisionedCapacity && (
                <TextContent className="ceph-add-capacity__provisioned-capacity">
                  {' '}
                  {t('ceph-storage-plugin~x {{ replica, number }} replicas =', {
                    replica,
                  })}{' '}
                  <strong data-test="provisioned-capacity">{provisionedCapacity}&nbsp;TiB</strong>
                </TextContent>
              )}
              <TextContent className="pf-u-font-weight-bold pf-u-secondary-color-100 ceph-add-capacity__current-capacity">
                {t('ceph-storage-plugin~Currently Used:')}&nbsp;
                {currentCapacity}
              </TextContent>
            </FormGroup>
          </>
        )}
      </ModalBody>
      <ModalSubmitFooter
        inProgress={inProgress}
        errorMessage={errorMessage}
        submitText={t('ceph-storage-plugin~Add')}
        cancel={cancel}
      />
    </Form>
  );
};

export type AddCapacityModalProps = {
  kind?: any;
  ocsConfig?: any;
  cancel?: () => void;
  close?: () => void;
};

export const addCapacityModal = createModalLauncher(AddCapacityModal);
