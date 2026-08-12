import { useMemo, useState } from "react";
import "./App.css";

type DownloadStatus =
  | "validating"
  | "pending"
  | "queued"
  | "processing"
  | "completed"
  | "partial"
  | "error";

type FailedTrack = {
  index: number;
  title: string;
  url?: string;
  videoId?: string;
  category: string;
  reason: string;
};

type DownloadItem = {
  id: string;
  url: string;
  title?: string;
  artist?: string;
  status: DownloadStatus;
  progress: number;
  error?: string;
  expectedTrackCount?: number;
  downloadedTrackCount?: number;
  failedTracks: FailedTrack[];
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

function App() {
  const [urlInput, setUrlInput] = useState("");
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [inputError, setInputError] = useState("");

  const canDownload = useMemo(() => {
    return (
      items.length > 0 &&
      !isSubmitting &&
      !isValidating &&
      items.some((item) => item.status === "pending")
    );
  }, [items, isSubmitting, isValidating]);

  async function handleSubmitUrl() {
    const cleanUrl = urlInput.trim();

    if (!cleanUrl || isValidating) return;

    setInputError("");

    if (!isValidUrl(cleanUrl)) {
      setInputError("Ingresa un link válido.");
      return;
    }

    const alreadyExists = items.some((item) => item.url === cleanUrl);

    if (alreadyExists) {
      setInputError("Ese link ya está en la tabla.");
      setUrlInput("");
      return;
    }

    const tempId = crypto.randomUUID();

    const newItem: DownloadItem = {
      id: tempId,
      url: cleanUrl,
      status: "validating",
      progress: 0,
      failedTracks: [],
    };

    setItems((current) => [newItem, ...current]);
    setUrlInput("");
    setIsValidating(true);

    try {
      const result = await validateUrlExists(cleanUrl);

      if (!result.exists) {
        setItems((current) =>
          current.map((item) =>
            item.id === tempId
              ? {
                  ...item,
                  status: "error",
                  error: result.error ?? "No se encontró el contenido.",
                }
              : item
          )
        );

        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.id === tempId
            ? {
                ...item,
                title: result.title ?? "Contenido desconocido",
                artist: result.artist ?? "Fuente desconocida",
                status: "pending",
                error: undefined,
                expectedTrackCount: undefined,
                downloadedTrackCount: undefined,
                failedTracks: [],
              }
            : item
        )
      );
    } catch {
      setItems((current) =>
        current.map((item) =>
          item.id === tempId
            ? {
                ...item,
                status: "error",
                error: "No se pudo validar el link.",
              }
            : item
        )
      );
    } finally {
      setIsValidating(false);
    }
  }

  async function validateUrlExists(url: string): Promise<{
    exists: boolean;
    title?: string;
    artist?: string;
    error?: string;
  }> {
    const response = await fetch(`${API_URL}/api/links/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error("Error validando link.");
    }

    return response.json();
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function clearItems() {
    setItems([]);
    setInputError("");
  }

  async function downloadAll() {
    try {
      setIsSubmitting(true);

      const validItems = items.filter((item) => item.status === "pending");

      setItems((current) =>
        current.map((item) =>
          item.status === "pending"
            ? {
                ...item,
                status: "queued",
                progress: 0,
                error: undefined,
                expectedTrackCount: undefined,
                downloadedTrackCount: undefined,
                failedTracks: [],
              }
            : item
        )
      );

      const response = await fetch(`${API_URL}/api/download-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: validItems.map((item) => ({
            url: item.url,
          })),
          format: "mp3",
          bitrate: "192k",
        }),
      });

      if (!response.ok) {
        throw new Error("No se pudo iniciar la descarga.");
      }

      const data: { jobId: string } = await response.json();

      await pollJobStatus(data.jobId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ocurrió un error inesperado.";

      setItems((current) =>
        current.map((item) =>
          item.status === "queued" || item.status === "processing"
            ? {
                ...item,
                status: "error",
                error: message,
              }
            : item
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function pollJobStatus(jobId: string) {
    const pollIntervalMs = 1500;

    return new Promise<void>((resolve, reject) => {
      let timeoutId: number | undefined;
      let isFinished = false;

      function stopPolling() {
        isFinished = true;

        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      }

      function scheduleNextPoll() {
        if (!isFinished) {
          timeoutId = window.setTimeout(() => void pollStatus(), pollIntervalMs);
        }
      }

      async function pollStatus() {
        try {
          const response = await fetch(`${API_URL}/api/download-jobs/${jobId}`);

          if (!response.ok) {
            throw new Error("No se pudo consultar el progreso.");
          }

          const data: {
            status: string;
            items: Array<{
              url: string;
              status: DownloadStatus;
              progress: number;
              error?: string;
              expectedTrackCount?: number;
              downloadedTrackCount?: number;
              failedTracks?: FailedTrack[];
            }>;
            downloadUrl?: string;
          } = await response.json();

          setItems((current) =>
            current.map((item) => {
              const updatedItem = data.items.find(
                (jobItem) => jobItem.url === item.url
              );

              if (!updatedItem) {
                if (item.status === "queued" && data.status === "processing") {
                  return {
                    ...item,
                    status: "processing",
                    progress: Math.max(item.progress, 5),
                  };
                }

                return item;
              }

              return {
                ...item,
                status: updatedItem.status,
                progress: getNextProgress(item, updatedItem),
                error: updatedItem.error,
                expectedTrackCount: updatedItem.expectedTrackCount,
                downloadedTrackCount: updatedItem.downloadedTrackCount,
                failedTracks: updatedItem.failedTracks ?? [],
              };
            })
          );

          if (data.status === "completed") {
            stopPolling();

            if (data.downloadUrl) {
              window.location.href = `${API_URL}${data.downloadUrl}`;
            }

            resolve();
            return;
          }

          if (data.status === "error") {
            stopPolling();
            reject(new Error("El proceso terminó con errores."));
            return;
          }

          scheduleNextPoll();
        } catch (error) {
          stopPolling();
          reject(error);
        }
      }

      void pollStatus();
    });
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Video o playlist a MP3</p>
        <h1>Descargar videos y playlists por lote</h1>
        <p className="description">
          Pega un link de video o playlist, presiona Enter y se validará antes de agregarlo a la
          tabla.
        </p>
      </section>

      <section className="card inputCard">
        <label htmlFor="urlInput">Link del video, canción o playlist</label>

        <div className="inputRow">
          <input
            id="urlInput"
            type="url"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmitUrl();
              }
            }}
            placeholder="https://..."
            disabled={isValidating}
          />

          <button
            type="button"
            onClick={handleSubmitUrl}
            disabled={isValidating || !urlInput.trim()}
          >
            {isValidating ? "Validando..." : "Agregar"}
          </button>
        </div>

        {inputError && <p className="inputError">{inputError}</p>}

        <p className="hint">Puedes pegar videos individuales o playlists completas.</p>
      </section>

      <section className="card">
        <div className="tableHeader">
          <div>
            <h2>Lista de descargas</h2>
            <p>{items.length} link(s) agregados</p>
          </div>

          <div className="headerActions">
            <button
              type="button"
              className="secondary"
              onClick={clearItems}
              disabled={isSubmitting || items.length === 0}
            >
              Limpiar
            </button>

            <button
              type="button"
              className="primary"
              disabled={!canDownload}
              onClick={downloadAll}
            >
              {isSubmitting ? "Procesando..." : "Descargar todo"}
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="empty">Todavía no agregaste links.</p>
        ) : (
          <div className="tableWrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Contenido</th>
                  <th>Canal / fuente</th>
                  <th>Estado</th>
                  <th>Progreso</th>
                  <th>Detalle</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>

                    <td className="titleCell">{item.title ?? "Validando..."}</td>

                    <td className="artistCell">{item.artist ?? "-"}</td>

                    <td>
                      <span className={`status ${item.status}`}>
                        {getStatusLabel(item.status)}
                      </span>
                    </td>

                    <td>
                      <div className="progress">
                        <div
                          className={`progressBar ${
                            item.status === "processing" ? "processing" : ""
                          }`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <small>{item.progress}%</small>
                    </td>

                    <td className={item.status === "partial" ? "warningCell" : "errorCell"}>
                      <DownloadDetail item={item} />
                    </td>

                    <td>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => removeItem(item.id)}
                        disabled={isSubmitting}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function DownloadDetail({ item }: { item: DownloadItem }) {
  const hasFailedTracks = item.failedTracks.length > 0;
  const expectedTrackCount = item.expectedTrackCount ?? 0;
  const downloadedTrackCount = item.downloadedTrackCount ?? 0;
  const hasCounts = expectedTrackCount > 0;

  if (!item.error && !hasFailedTracks && !hasCounts) {
    return <>-</>;
  }

  return (
    <div className="downloadDetail">
      {hasCounts && (
        <p>
          {downloadedTrackCount} de {expectedTrackCount} canciones
        </p>
      )}

      {item.error && <p>{item.error}</p>}

      {hasFailedTracks && (
        <details className="trackFailures">
          <summary>{item.failedTracks.length} canción(es) sin descargar</summary>
          <ol>
            {item.failedTracks.map((track) => (
              <li key={`${track.index}-${track.videoId ?? track.title}`}>
                <strong>#{track.index}</strong> {track.title}
                <span>{track.category}</span>
                {track.url && (
                  <a href={track.url} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                )}
                <small>{track.reason}</small>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function getNextProgress(
  currentItem: DownloadItem,
  updatedItem: Pick<DownloadItem, "status" | "progress">
) {
  const nextProgress = clampProgress(updatedItem.progress);

  if (updatedItem.status === "completed" || updatedItem.status === "partial") {
    return 100;
  }

  if (updatedItem.status === "error") {
    return nextProgress;
  }

  return Math.max(currentItem.progress, nextProgress);
}

function clampProgress(progress: number) {
  return Math.min(Math.max(Math.round(progress), 0), 100);
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getStatusLabel(status: DownloadStatus) {
  const labels: Record<DownloadStatus, string> = {
    validating: "Validando",
    pending: "Listo",
    queued: "En cola",
    processing: "Procesando",
    completed: "Completado",
    partial: "Parcial",
    error: "Error",
  };

  return labels[status];
}

export default App;


