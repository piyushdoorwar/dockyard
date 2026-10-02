import clsx from "clsx";
import type { ReactNode } from "react";

type Variant = "primary" | "cancel" | "delete" | "danger-outline";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn btn-custom",
  cancel: "btn btn-cancel",
  delete: "btn btn-delete",
  "danger-outline": "btn btn-danger-outline",
};

interface ButtonProps {
  children: ReactNode;
  variant?: Variant;
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  className?: string;
}

export function Button({ children, variant = "primary", icon, onClick, disabled, type = "button", title, className }: ButtonProps) {
  return (
    <button type={type} className={clsx(VARIANT_CLASS[variant], className)} onClick={onClick} disabled={disabled} title={title}>
      {icon && <i className={clsx("pi", icon)} style={{ fontSize: 13 }} aria-hidden />}
      {children}
    </button>
  );
}

interface IconButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Tooltip when disabled, explaining why. */
  disabledReason?: string;
}

export function IconButton({ icon, label, onClick, disabled, danger, disabledReason }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={disabled && disabledReason ? disabledReason : label}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        disabled
          ? "text-[#C4CADA]"
          : danger
            ? "text-danger hover:bg-[#FFEEF3]"
            : "text-grey hover:bg-customBgColor-grey hover:text-customColor-blue",
      )}
    >
      <i className={clsx("pi", icon)} style={{ fontSize: 14 }} aria-hidden />
    </button>
  );
}
