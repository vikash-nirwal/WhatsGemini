import React, { ReactNode } from "react";
import { FaTimes } from "react-icons/fa";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "./dialog";
import { Button } from "src/components/atoms/button";
import { TermLink } from "src/components/atoms/TermLink";
import { useColorTheme } from "src/hooks/useColorTheme";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children }) => {
  const { is } = useColorTheme();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="default">
        <DialogHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <DialogTitle>{title}</DialogTitle>
            {subtitle && <p data-slot="comment" className="text-[13.5px] text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <DialogClose asChild>
            {is("terminal") ? (
              <TermLink label="x" aria-label="Close" className="flex-shrink-0" />
            ) : (
              <Button variant="ghost" size="icon" className="h-auto w-auto p-1 -m-1 rounded-full text-muted-foreground hover:text-foreground flex-shrink-0" aria-label="Close">
                <FaTimes />
              </Button>
            )}
          </DialogClose>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 flex flex-col gap-2">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Modal;
