/**
 * Marginalia — control primitives.
 *
 * These are the only controls a screen may use. Raw <button>, <input>,
 * <select> and <textarea> are lint errors outside `src/modules/design/`.
 */
export { Button } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";

export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";

export { LinkButton } from "./LinkButton";
export type { LinkButtonProps } from "./LinkButton";

export { Field, useFieldControl } from "./Field";
export type { FieldControlProps, FieldProps } from "./Field";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { Textarea } from "./Textarea";
export type { TextareaProps } from "./Textarea";

export { Select } from "./Select";
export type { SelectProps } from "./Select";

export { Switch } from "./Switch";
export type { SwitchProps } from "./Switch";

export { Chip } from "./Chip";
export type { ChipProps, ChipTone } from "./Chip";

export { Tab, TabList, TabPanel, Tabs } from "./Tabs";
export type { TabListProps, TabPanelProps, TabProps, TabsActivation, TabsProps } from "./Tabs";

export { resolveControlSize } from "./size";
export type { ControlSize } from "./size";
