import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { FaExclamationTriangle, FaInfoCircle } from "react-icons/fa";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from "src/components/molecules/alert-dialog";

interface ModalState {
  isOpen: boolean;
  title: string;
  message: string;
  isConfirm: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface ModalContextType {
  showAlert: (title: string, message: string) => Promise<void>;
  showConfirm: (title: string, message: string) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};

export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    title: "",
    message: "",
    isConfirm: false,
  });

  const showAlert = useCallback((title: string, message: string): Promise<void> => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        title,
        message,
        isConfirm: false,
        onConfirm: () => {
          setModalState((prev) => ({ ...prev, isOpen: false }));
          resolve();
        },
      });
    });
  }, []);

  const showConfirm = useCallback((title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        title,
        message,
        isConfirm: true,
        onConfirm: () => {
          setModalState((prev) => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setModalState((prev) => ({ ...prev, isOpen: false }));
          resolve(false);
        },
      });
    });
  }, []);

  // Escape lands here too (AlertDialog doesn't close on backdrop click by
  // design - it demands an explicit choice) and routes through to onCancel
  // (or onConfirm for a plain alert, which only has one exit path).
  const handleClose = modalState.isConfirm ? modalState.onCancel : modalState.onConfirm;

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      <AlertDialog open={modalState.isOpen} onOpenChange={(open) => !open && handleClose?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${modalState.isConfirm ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-secondary/15 text-secondary'}`}>
                {modalState.isConfirm ? <FaExclamationTriangle size={18} /> : <FaInfoCircle size={18} />}
              </div>
              <AlertDialogTitle className="flex-1 text-left">{modalState.title}</AlertDialogTitle>
            </div>
            <p className="text-muted-foreground text-sm text-left">
              {modalState.message}
            </p>
          </AlertDialogHeader>

          <AlertDialogFooter>
            {modalState.isConfirm && (
              <AlertDialogCancel onClick={modalState.onCancel}>Cancel</AlertDialogCancel>
            )}
            <AlertDialogAction
              onClick={modalState.onConfirm}
              variant={modalState.isConfirm ? "destructive" : "default"}
            >
              {modalState.isConfirm ? 'Confirm' : 'OK'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModalContext.Provider>
  );
};
