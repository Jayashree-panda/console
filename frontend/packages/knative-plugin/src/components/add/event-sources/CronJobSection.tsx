import * as React from 'react';
import { TextInputTypes } from '@patternfly/react-core';
import { InputField } from '@console/shared';
import FormSection from '@console/dev-console/src/components/import/section/FormSection';

interface CronJobSectionProps {
  title: string;
}

const CronJobSection: React.FC<CronJobSectionProps> = ({ title }) => (
  <FormSection title={title} extraMargin>
    <InputField
      type={TextInputTypes.text}
      name="data.cronjobsource.data"
      label="Data"
      helpText="The data posted to the target function"
    />
    <InputField
      type={TextInputTypes.text}
      name="data.cronjobsource.schedule"
      label="Schedule"
      helpText="Schedule is described using the unix-cron string format (* * * * *)"
      required
    />
  </FormSection>
);

export default CronJobSection;
