type ArtifactKind = 'code' | 'html' | 'react';

type ArtifactOpenPayload = {
  id: string;
  type: ArtifactKind;
  title: string;
  language: string;
};

type ParserCallbacks = {
  onText: (text: string) => void;
  onArtifactOpen: (payload: ArtifactOpenPayload) => void;
  onArtifactDelta: (artifactId: string, delta: string) => void;
  onArtifactClose: (artifactId: string) => void;
};

type ParserState = 'text' | 'artifact';

const OPENING_FRAGMENT = '<artifact';
const CLOSING_FRAGMENT = '</artifact>';
const OPENING_GUARD = OPENING_FRAGMENT.length - 1;
const CLOSING_GUARD = CLOSING_FRAGMENT.length - 1;

const normalizeArtifactType = (value: string | undefined): ArtifactKind => {
  if (value === 'html' || value === 'react') {
    return value;
  }

  return 'code';
};

const parseAttributes = (rawTag: string): ArtifactOpenPayload | null => {
  const attributeMatches = [...rawTag.matchAll(/([a-zA-Z_][\w-]*)="([^"]*)"/g)];
  const attributes = Object.fromEntries(attributeMatches.map((match) => [match[1], match[2]]));
  const type = normalizeArtifactType(attributes.type);
  const title = attributes.title?.trim() || 'Untitled Artifact';
  const language = attributes.language?.trim() || (type === 'react' ? 'tsx' : type === 'html' ? 'html' : 'text');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    type,
    title,
    language,
  };
};

export class ArtifactStreamParser {
  private state: ParserState = 'text';
  private buffer = '';
  private activeArtifactId: string | null = null;

  public constructor(private readonly callbacks: ParserCallbacks) {}

  public push(chunk: string): void {
    if (!chunk) {
      return;
    }

    this.buffer += chunk;
    this.process();
  }

  public finish(): void {
    if (this.state === 'text') {
      if (this.buffer) {
        this.callbacks.onText(this.buffer);
      }
    } else if (this.activeArtifactId && this.buffer) {
      this.callbacks.onArtifactDelta(this.activeArtifactId, this.buffer);
      this.callbacks.onArtifactClose(this.activeArtifactId);
    } else if (this.activeArtifactId) {
      this.callbacks.onArtifactClose(this.activeArtifactId);
    }

    this.buffer = '';
    this.state = 'text';
    this.activeArtifactId = null;
  }

  private process(): void {
    while (this.buffer.length > 0) {
      if (this.state === 'text') {
        const openIndex = this.buffer.indexOf(OPENING_FRAGMENT);

        if (openIndex === -1) {
          const safeLength = Math.max(0, this.buffer.length - OPENING_GUARD);
          if (safeLength > 0) {
            this.callbacks.onText(this.buffer.slice(0, safeLength));
            this.buffer = this.buffer.slice(safeLength);
          }
          return;
        }

        if (openIndex > 0) {
          this.callbacks.onText(this.buffer.slice(0, openIndex));
          this.buffer = this.buffer.slice(openIndex);
        }

        const endOfTag = this.buffer.indexOf('>');
        if (endOfTag === -1) {
          return;
        }

        const rawTag = this.buffer.slice(0, endOfTag + 1);
        const payload = parseAttributes(rawTag);
        if (!payload) {
          this.callbacks.onText(this.buffer[0]);
          this.buffer = this.buffer.slice(1);
          continue;
        }

        this.callbacks.onArtifactOpen(payload);
        this.activeArtifactId = payload.id;
        this.state = 'artifact';
        this.buffer = this.buffer.slice(endOfTag + 1);
        continue;
      }

      const closeIndex = this.buffer.indexOf(CLOSING_FRAGMENT);
      if (closeIndex === -1) {
        const safeLength = Math.max(0, this.buffer.length - CLOSING_GUARD);
        if (safeLength > 0 && this.activeArtifactId) {
          this.callbacks.onArtifactDelta(this.activeArtifactId, this.buffer.slice(0, safeLength));
          this.buffer = this.buffer.slice(safeLength);
        }
        return;
      }

      if (closeIndex > 0 && this.activeArtifactId) {
        this.callbacks.onArtifactDelta(this.activeArtifactId, this.buffer.slice(0, closeIndex));
      }

      if (this.activeArtifactId) {
        this.callbacks.onArtifactClose(this.activeArtifactId);
      }

      this.buffer = this.buffer.slice(closeIndex + CLOSING_FRAGMENT.length);
      this.activeArtifactId = null;
      this.state = 'text';
    }
  }
}