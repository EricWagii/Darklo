/**
 * 高端商业风格 React 组件库
 */

import React from 'react';
import '../styles/design-system.css';

/* ==================== 布局组件 ==================== */

export const Container: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`w-full max-w-7xl mx-auto px-6 py-12 ${className}`}>{children}</div>
);

export const Section: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <section className={`py-16 ${className}`}>{children}</section>;

export const Grid: React.FC<{
  children: React.ReactNode;
  cols?: number;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ children, cols = 2, gap = 'md', className = '' }) => {
  const gapClass = gap === 'sm' ? 'gap-4' : gap === 'lg' ? 'gap-8' : 'gap-6';
  return (
    <div
      className={`grid grid-cols-${cols} ${gapClass} ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {children}
    </div>
  );
};

/* ==================== 标题组件 ==================== */

export const SectionLabel: React.FC<{ children: React.ReactNode; number?: string }> = ({
  children,
  number,
}) => (
  <div className="label mb-6">
    {number && <span className="text-accent">{number} / </span>}
    {children}
  </div>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; subtitle?: string }> = ({
  children,
  subtitle,
}) => (
  <div className="mb-12">
    <h2 className="text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
      {children}
    </h2>
    {subtitle && <p className="text-secondary text-lg">{subtitle}</p>}
  </div>
);

export const CardTitle: React.FC<{ children: React.ReactNode; accent?: boolean }> = ({
  children,
  accent = false,
}) => (
  <h3
    className={`text-2xl font-semibold ${accent ? 'text-accent' : ''}`}
    style={{ fontFamily: 'var(--font-serif)' }}
  >
    {children}
  </h3>
);

/* ==================== 分隔线组件 ==================== */

export const Divider: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`divider ${className}`} />
);

export const DividerVertical: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`divider-vertical ${className}`} />
);

/* ==================== 卡片组件 ==================== */

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
}> = ({ children, className = '', header }) => (
  <div className={`card ${className}`}>
    {header && <div className="card-header">{header}</div>}
    {children}
  </div>
);

export const DataCard: React.FC<{
  label: string;
  value: React.ReactNode;
  unit?: string;
  accent?: boolean;
}> = ({ label, value, unit, accent = false }) => (
  <div className="card">
    <div className={`label mb-4 ${accent ? 'text-accent' : ''}`}>{label}</div>
    <div className="flex items-baseline gap-2">
      <span className="text-4xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </span>
      {unit && <span className="text-secondary text-lg">{unit}</span>}
    </div>
  </div>
);

/* ==================== 按钮组件 ==================== */

export const Button: React.FC<{
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'error';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ children, variant = 'secondary', size = 'md', onClick, disabled = false, className = '' }) => {
  const sizeClass = size === 'sm' ? 'px-4 py-2 text-xs' : size === 'lg' ? 'px-8 py-3 text-lg' : 'px-6 py-2 text-sm';
  const variantClass = `btn btn-${variant}`;

  return (
    <button
      className={`${variantClass} ${sizeClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

/* ==================== 输入框组件 ==================== */

export const Input: React.FC<{
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
}> = ({ placeholder, value, onChange, disabled = false, className = '' }) => (
  <input
    type="text"
    className={`input ${className}`}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    disabled={disabled}
  />
);

export const TextArea: React.FC<{
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  className?: string;
}> = ({ placeholder, value, onChange, rows = 4, className = '' }) => (
  <textarea
    className={`input ${className}`}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    rows={rows}
  />
);

/* ==================== 进度条组件 ==================== */

export const ProgressBar: React.FC<{ value: number; max?: number; label?: string }> = ({
  value,
  max = 100,
  label,
}) => {
  const percentage = (value / max) * 100;
  return (
    <div className="mb-4">
      {label && <div className="label mb-2">{label}</div>}
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${percentage}%` }} />
      </div>
      <div className="text-secondary text-sm mt-2">{Math.round(percentage)}%</div>
    </div>
  );
};

/* ==================== 统计组件 ==================== */

export const StatGrid: React.FC<{
  stats: Array<{ label: string; value: React.ReactNode; unit?: string; accent?: boolean }>;
}> = ({ stats }) => (
  <Grid cols={stats.length} gap="lg">
    {stats.map((stat, idx) => (
      <DataCard key={idx} {...stat} />
    ))}
  </Grid>
);

/* ==================== 表格组件 ==================== */

export const Table: React.FC<{
  headers: string[];
  rows: React.ReactNode[][];
  className?: string;
}> = ({ headers, rows, className = '' }) => (
  <table className={`data-table ${className}`}>
    <thead>
      <tr>
        {headers.map((header, idx) => (
          <th key={idx}>{header}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, rowIdx) => (
        <tr key={rowIdx}>
          {row.map((cell, cellIdx) => (
            <td key={cellIdx}>{cell}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

/* ==================== 列表组件 ==================== */

export const ListItem: React.FC<{
  number?: number;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  accent?: boolean;
}> = ({ number, title, subtitle, accent = false }) => (
  <div className="card mb-4">
    <div className="flex gap-4">
      {number !== undefined && (
        <div className={`text-2xl font-bold ${accent ? 'text-accent' : 'text-secondary'}`}>{number}</div>
      )}
      <div className="flex-1">
        <h4 className={accent ? 'text-accent' : ''}>{title}</h4>
        {subtitle && <p className="text-secondary text-sm mt-2">{subtitle}</p>}
      </div>
    </div>
  </div>
);

/* ==================== 信息框组件 ==================== */

export const InfoBox: React.FC<{
  title: string;
  children: React.ReactNode;
  type?: 'info' | 'success' | 'error' | 'warning';
}> = ({ title, children, type = 'info' }) => {
  const colorClass =
    type === 'success' ? 'text-success' : type === 'error' ? 'text-error' : type === 'warning' ? 'text-warning' : 'text-accent';

  return (
    <div className="card border-l-4" style={{ borderLeftColor: 'var(--color-accent-primary)' }}>
      <h5 className={colorClass}>{title}</h5>
      <p className="text-secondary mt-2">{children}</p>
    </div>
  );
};

/* ==================== 加载状态组件 ==================== */

export const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  return (
    <div className={`${sizeClass} border-2 border-accent border-t-transparent rounded-full animate-spin`} />
  );
};

/* ==================== 徽章组件 ==================== */

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'accent' | 'success' | 'error' | 'warning';
}> = ({ children, variant = 'accent' }) => {
  const colorClass =
    variant === 'success'
      ? 'bg-green-900 text-success'
      : variant === 'error'
        ? 'bg-red-900 text-error'
        : variant === 'warning'
          ? 'bg-yellow-900 text-warning'
          : 'bg-yellow-900 text-accent';

  return <span className={`px-3 py-1 rounded text-xs font-semibold ${colorClass}`}>{children}</span>;
};

/* ==================== 确认对话框组件 ==================== */

export const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isOpen: boolean;
}> = ({ title, message, onConfirm, onCancel, isOpen }) => {
  const [isLoading, setIsLoading] = React.useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      // 成功后关闭Dialog
      onCancel();
    } catch (error) {
      console.error('[ConfirmDialog] 确认操作失败:', error);
      // 错误时也要关闭Dialog，但保持loading状态，以便用户看到错误
      setTimeout(() => {
        setIsLoading(false);
        onCancel();
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <Card className="w-96">
        <h3 className="text-2xl font-bold mb-4">{title}</h3>
        <p className="text-secondary mb-6">{message}</p>
        {isLoading && (
          <div className="mb-4 text-center text-gray-400 text-sm">
            处理中...
          </div>
        )}
        <div className="flex gap-4 justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            取消
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? '处理中...' : '确认'}
          </Button>
        </div>
      </Card>
    </div>
  );
};
