import type { WidgetRegistry } from 'react-simple-schema-form';
import { CounterWidget } from './CounterWidget';
import { EpochWidget } from './EpochWidget';
import { InlineAddressWidget } from './InlineAddressWidget';
import { SchedulerWidget } from './SchedulerWidget';
import { ToggleSectionWidget } from './ToggleSectionWidget';
import { TimePickerWidget } from './TimePickerWidget';

/** Every custom widget the demo registers; schemas reference these by name. */
export const demoWidgets: WidgetRegistry = {
  counter: CounterWidget,
  epoch: EpochWidget,
  'inline-address': InlineAddressWidget,
  scheduler: SchedulerWidget,
  toggleSection: ToggleSectionWidget,
  timePicker: TimePickerWidget,
};
