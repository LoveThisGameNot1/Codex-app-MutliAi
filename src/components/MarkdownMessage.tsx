import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

const markdownComponents: Components = {
  code(props) {
    const { children, className } = props;
    const isInline = !className;

    if (isInline) {
      return <code className="rounded-md bg-slate-900 px-1.5 py-0.5 text-sky-200">{children}</code>;
    }

    return (
      <pre className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/90 p-4 text-sm text-slate-200">
        <code className={className}>{children}</code>
      </pre>
    );
  },
  p(props) {
    return <p className="leading-7 text-slate-200">{props.children}</p>;
  },
  ul(props) {
    return <ul className="list-disc space-y-2 pl-5 text-slate-200">{props.children}</ul>;
  },
  ol(props) {
    return <ol className="list-decimal space-y-2 pl-5 text-slate-200">{props.children}</ol>;
  },
  a(props) {
    return (
      <a
        {...props}
        className="text-sky-300 underline decoration-sky-400/50 underline-offset-4 transition hover:text-sky-200"
        target="_blank"
        rel="noreferrer"
      />
    );
  },
  blockquote(props) {
    return <blockquote className="border-l-4 border-sky-400/40 pl-4 text-slate-300">{props.children}</blockquote>;
  },
};

export const MarkdownMessage = ({ content }: { content: string }) => {
  return <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>;
};