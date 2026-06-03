/**
 * 采集通知组件 - 替换原生 alert/confirm
 * 
 * 使用 sonner toast 和 Dialog 组件提供现代化的用户反馈
 */

import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CollectionNotificationsProps {
  successMessage?: string | null;
  errorMessage?: string | null;
}

export function CollectionNotifications({
  successMessage,
  errorMessage,
}: CollectionNotificationsProps) {
  // 显示成功通知
  React.useEffect(() => {
    if (successMessage) {
      toast.success(successMessage, {
        duration: 3000,
        position: 'top-right',
      });
    }
  }, [successMessage]);

  // 显示错误通知
  React.useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage, {
        duration: 5000,
        position: 'top-right',
      });
    }
  }, [errorMessage]);

  return null;
}

/**
 * 确认对话框 - 替换 confirm()
 */
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  isDangerous = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            variant={isDangerous ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 信息对话框 - 替换 alert()
 */
interface InfoDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  onClose: () => void;
}

export function InfoDialog({
  isOpen,
  title,
  message,
  type = 'info',
  onClose,
}: InfoDialogProps) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <span className="mr-2">{getIcon()}</span>
            {title}
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 使用 Hook 来管理对话框状态
 */
export function useConfirmDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>>({
    title: '',
    description: '',
  });
  const [onConfirmCallback, setOnConfirmCallback] = useState<() => void>(() => {});

  const confirm = (
    title: string,
    description: string,
    onConfirm: () => void,
    options?: { isDangerous?: boolean; confirmText?: string; cancelText?: string }
  ) => {
    setConfig({
      title,
      description,
      isDangerous: options?.isDangerous,
      confirmText: options?.confirmText,
      cancelText: options?.cancelText,
    });
    setOnConfirmCallback(() => onConfirm);
    setIsOpen(true);
  };

  return {
    isOpen,
    config,
    confirm,
    onConfirm: () => {
      onConfirmCallback();
      setIsOpen(false);
    },
    onCancel: () => setIsOpen(false),
  };
}

/**
 * 使用 Hook 来管理信息对话框状态
 */
export function useInfoDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<Omit<InfoDialogProps, 'isOpen' | 'onClose'>>({
    title: '',
    message: '',
    type: 'info',
  });

  const show = (
    title: string,
    message: string,
    type?: 'info' | 'warning' | 'error' | 'success'
  ) => {
    setConfig({ title, message, type });
    setIsOpen(true);
  };

  return {
    isOpen,
    config,
    show,
    onClose: () => setIsOpen(false),
  };
}
