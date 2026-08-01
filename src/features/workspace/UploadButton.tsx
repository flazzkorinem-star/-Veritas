import { Icon } from "@/ui/Icon";

interface UploadButtonProps {
  id: string;
  compact?: boolean;
}

export function UploadButton({ id, compact = false }: UploadButtonProps) {
  return (
    <label className={compact ? "upload-button compact" : "upload-button"} htmlFor={id}>
      <Icon name="upload" size={compact ? 22 : 18} />
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
