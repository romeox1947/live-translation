type Props = {
  partialTranscript: string;
  finalTranscripts: string[];
  translations: string[];
};

export function TranslationCaptions({
  partialTranscript,
  finalTranscripts,
  translations,
}: Props) {
  return (
    <section className="captions-card" aria-label="Live captions">
      <div className="card-heading captions-heading">
        <div>
          <p className="eyebrow">LIVE CAPTIONS</p>
          <h2>Follow every word</h2>
        </div>
        <span className="caption-live"><span className="status-dot" /> LIVE</span>
      </div>
      <div className="caption-columns">
        <div className="caption-column">
          <h3><span className="caption-indicator original-indicator" /> Original speech</h3>
          <div className="caption-copy">
            {finalTranscripts.length ? (
              finalTranscripts.map((text, index) => <p key={`${index}-${text}`}>{text}</p>)
            ) : (
              <p className="caption-placeholder">Final transcript will appear here.</p>
            )}
            {partialTranscript && <p className="partial-caption">{partialTranscript}</p>}
          </div>
        </div>
        <div className="caption-column translated-column">
          <h3><span className="caption-indicator translated-indicator" /> Translated speech</h3>
          <div className="caption-copy">
            {translations.length ? (
              translations.map((text, index) => <p key={`${index}-${text}`}>{text}</p>)
            ) : (
              <p className="caption-placeholder">Translated text will appear here.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
