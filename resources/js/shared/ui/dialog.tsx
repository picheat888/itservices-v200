import { useT } from '@/lang';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

import { useMenuReturnFocus } from '@/shared/hooks/use-menu-return-focus';
import { cn } from '@/shared/lib/utils';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            'motion-sheet data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/30 backdrop-blur-sm',
            className,
        )}
        {...props}
    />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
    const t = useT();
    const { handleOpen, handleClose } = useMenuReturnFocus(onOpenAutoFocus, onCloseAutoFocus);
    return (
        <DialogPortal>
            <DialogOverlay />
            <DialogPrimitive.Content
                ref={ref}
                onOpenAutoFocus={handleOpen}
                onCloseAutoFocus={handleClose}
                className={cn(
                    // [&>*]:min-w-0 keeps wide children inside max-w-lg
                    'motion-sheet bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg min-w-0 translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg duration-200 sm:rounded-lg [&>*]:min-w-0',
                    className,
                )}
                {...props}
            >
                {children}
                {/* 32px hit area; the 16px icon sits 16px from the top and right edges */}
                <DialogPrimitive.Close className="ring-offset-background focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-2 right-2 grid size-8 place-items-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none">
                    <X className="h-4 w-4" />
                    <span className="sr-only">{t('close')}</span>
                </DialogPrimitive.Close>
            </DialogPrimitive.Content>
        </DialogPortal>
    );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

// Sizing for the full-size centered "focus" dialogs (`!flex` overrides the base grid)
const focusDialogContentClass = '!flex h-[min(860px,calc(100dvh-72px))] w-[calc(100vw-2rem)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0';

// Small form dialogs: 560 wide, height capped, the body scrolls between header and footer bar
const formDialogContentClass = '!flex max-h-[calc(100dvh-4.5rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col gap-0 overflow-visible p-0';

const FormDialogContent = React.forwardRef<React.ElementRef<typeof DialogContent>, React.ComponentPropsWithoutRef<typeof DialogContent>>(
    ({ className, ...props }, ref) => <DialogContent ref={ref} className={cn(formDialogContentClass, className)} {...props} />,
);
FormDialogContent.displayName = 'FormDialogContent';

const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('min-h-0 flex-1 space-y-6 overflow-y-auto border-t px-6 py-6', className)} {...props} />
);
DialogBody.displayName = 'DialogBody';

const DialogFooterBar = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('border-border/60 bg-muted/30 flex items-center justify-end gap-2 rounded-b-lg border-t px-6 py-3.5', className)} {...props} />
);
DialogFooterBar.displayName = 'DialogFooterBar';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
    ({ className, ...props }, ref) => (
        <DialogPrimitive.Title ref={ref} className={cn('text-lg leading-none font-semibold tracking-tight', className)} {...props} />
    ),
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-muted-foreground text-sm', className)} {...props} />);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogFooterBar,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
    focusDialogContentClass,
    FormDialogContent,
    formDialogContentClass,
};
