import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Variant = "primary" | "cancel" | "delete" | "danger-outline" | "ghost";

interface ButtonProps {
  children?: ReactNode;
  variant?: Variant;
  size?: "md" | "sm";
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  className?: string;
}

export function Button({ children, variant = "primary", size = "md", icon: Icon, onClick, disabled, type = "button", title, className }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {Icon && <Icon size={size === "sm" ? 13 : 14} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
}

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Tooltip when disabled, explaining why. */
  disabledReason?: string;
}

export function IconButton({ icon: Icon, label, onClick, disabled, danger, disabledReason }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={disabled && disabledReason ? disabledReason : label}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
        disabled
          ? "text-muted"
          : danger
            ? "text-danger hover:bg-danger-soft"
            : "text-grey hover:bg-primary-soft hover:text-accent",
      )}
    >
      <Icon size={15} strokeWidth={2} aria-hidden />
    </button>
  );
}
