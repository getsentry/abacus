interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-8 ${className}`.trim()}>
      {children}
    </div>
  );
}
