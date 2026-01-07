import * as React from "react";
import { cn } from "@/lib/utils";

interface FloatingInputProps extends React.ComponentProps<"input"> {
  label: string;
  icon?: React.ReactNode;
}

const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ className, type, label, icon, id, ...props }, ref) => {
    return (
      <div className="relative">
        <input
          type={type}
          id={id}
          placeholder=" "
          className={cn(
            "peer flex h-12 w-full rounded-md border border-input bg-background px-3 pt-5 pb-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            icon && "pl-10",
            className,
          )}
          ref={ref}
          {...props}
        />
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            {icon}
          </div>
        )}
        <label
          htmlFor={id}
          className={cn(
            "absolute text-sm text-muted-foreground duration-200 transform -translate-y-3 scale-75 top-2 z-10 origin-[0] bg-background px-1 pointer-events-none",
            "peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2",
            "peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:top-2",
            icon ? "left-9" : "left-2"
          )}
        >
          {label}
        </label>
      </div>
    );
  },
);
FloatingInput.displayName = "FloatingInput";

export { FloatingInput };
