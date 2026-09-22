import type { WidgetRegistry } from 'react-simple-schema-form';
import { CounterWidget } from './CounterWidget';
import { DateTimePickerWidget } from './DateTimePickerWidget';
import { EpochWidget } from './EpochWidget';
import { InlineAddressWidget } from './InlineAddressWidget';
import { SchedulerWidget } from './SchedulerWidget';
import { TimePickerWidget } from './TimePickerWidget';

/** Every custom widget the demo registers; schemas reference these by name. */
export const demoWidgets: WidgetRegistry = {
  counter: CounterWidget,
  dateTimePicker: DateTimePickerWidget,
  epoch: EpochWidget,
  'inline-address': InlineAddressWidget,
  scheduler: SchedulerWidget,
  timePicker: TimePickerWidget,
};
