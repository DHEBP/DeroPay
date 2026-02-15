import { highlightCode } from "@/lib/shiki";
import { Copy } from "lucide-react";

export const CodeBlock = async ({
  code,
  lang = "typescript",
  filename,
  className = "",
}: {
  code: string;
  lang?: string;
  filename?: string;
  className?: string;
}) => {
  const html = await highlightCode(code.trim(), lang);

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-border bg-[#0d1117] ${className}`}
    >
      {filename && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <div className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="ml-2 font-mono text-xs text-text-tertiary">
            {filename}
          </span>
        </div>
      )}
      <div
        className="overflow-x-auto p-4 text-sm leading-relaxed [&_pre]:!bg-transparent [&_code]:!bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};
