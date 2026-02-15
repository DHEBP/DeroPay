import { createHighlighter, type Highlighter } from "shiki";

let highlighter: Highlighter | null = null;

export const getHighlighter = async () => {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ["github-dark-default"],
      langs: ["typescript", "tsx", "bash", "json"],
    });
  }
  return highlighter;
};

export const highlightCode = async (code: string, lang: string = "typescript") => {
  const hl = await getHighlighter();
  return hl.codeToHtml(code, {
    lang,
    theme: "github-dark-default",
  });
};
