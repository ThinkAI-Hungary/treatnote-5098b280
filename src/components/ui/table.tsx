import * as React from "react";

import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm">
      <table 
        ref={ref} 
        className={cn(
          "w-full caption-bottom text-sm",
          className
        )} 
        {...props} 
      />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead 
      ref={ref} 
      className={cn(
        "[&_tr]:border-b bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5",
        className
      )} 
      {...props} 
    />
  ),
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody 
      ref={ref} 
      className={cn(
        "[&_tr:last-child]:border-0",
        className
      )} 
      {...props} 
    />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot 
      ref={ref} 
      className={cn(
        "border-t bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )} 
      {...props} 
    />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border/30 transition-all duration-300 ease-out",
        "data-[state=selected]:bg-primary/10 data-[state=selected]:shadow-[inset_0_0_20px_hsl(270_70%_60%/0.1)]",
        "hover:bg-gradient-to-r hover:from-primary/5 hover:via-accent/5 hover:to-primary/5",
        "hover:shadow-[inset_0_0_30px_hsl(195_85%_55%/0.05)]",
        "group",
        className
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-semibold text-foreground/80",
        "bg-gradient-to-b from-transparent to-border/10",
        "[&:has([role=checkbox])]:pr-0",
        "first:rounded-tl-lg last:rounded-tr-lg",
        className
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td 
      ref={ref} 
      className={cn(
        "p-4 align-middle [&:has([role=checkbox])]:pr-0",
        "transition-colors duration-200",
        "group-hover:text-foreground",
        className
      )} 
      {...props} 
    />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption 
      ref={ref} 
      className={cn(
        "mt-4 text-sm text-muted-foreground",
        className
      )} 
      {...props} 
    />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
