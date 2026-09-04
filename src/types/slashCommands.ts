export interface SlashCommand {
  name: string;
  description: string;
  icon: string;
  action: () => void;
  isSelected?: boolean;
  disabled?: boolean;
}
