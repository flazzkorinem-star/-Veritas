interface UploadButtonProps {
  id: string;
  compact?: boolean;
}

export function UploadButton({ id, compact = false }: UploadButtonProps) {
  return (
    <label className={compact ? "upload-button compact" : "upload-button"} htmlFor={id}>
      <span aria-hidden="true">＋</span>
      <span>{compact ? "上传" : "上传学习材料"}</span>
      <input
        accept=".pdf,.docx,.pptx,.md,.txt,.png,.jpg,.jpeg,.webp"
        className="visually-hidden"
        id={id}
        type="file"
      />
    </label>
  );
}
