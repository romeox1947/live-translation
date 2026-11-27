import type { ConnectionState } from "../hooks/useRealtimeTranslation";

type Props = {
  connection: ConnectionState;
  configured: boolean | null;
};

export function ConnectionStatus({ connection, configured }: Props) {
  const label =
    connection === "connected"
      ? "Connected"
      : connection === "connecting"
        ? "Connecting"
        : configured === false
          ? "Setup required"
          : configured === null
            ? "Checking"
            : "Ready to connect";

  const tone =
    connection === "connected"
      ? "good"
      : connection === "connecting"
        ? "pending"
        : configured === false
          ? "bad"
          : "neutral";

  return (
    <div className={`connection-pill ${tone}`} aria-live="polite">
      <span className="status-dot" />
      {label}
    </div>
  );
}
