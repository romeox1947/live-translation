import type { Eagerness } from "../hooks/useRealtimeTranslation";

type Props = {
  language: string;
  eagerness: Eagerness;
  onLanguageChange: (language: string) => void;
  onEagernessChange: (eagerness: Eagerness) => void;
};

export function LanguageSelector({
  language,
  eagerness,
  onLanguageChange,
  onEagernessChange,
}: Props) {
  return (
    <div className="settings-row">
      <label className="field-control">
        <span className="field-label">Translate into</span>
        <select value={language} onChange={(event) => onLanguageChange(event.target.value)}>
          <option value="hi">Hindi</option>
          <option value="mr">Marathi</option>
          <option value="gu">Gujarati</option>
          <option value="ta">Tamil</option>
          <option value="original">Original audio</option>
        </select>
      </label>
      <label className="field-control compact">
        <span className="field-label">Translation timing</span>
        <select
          value={eagerness}
          onChange={(event) => onEagernessChange(event.target.value as Eagerness)}
        >
          <option value="low">Low · smoother</option>
          <option value="medium">Medium · balanced</option>
          <option value="high">High · faster</option>
        </select>
      </label>
    </div>
  );
}
