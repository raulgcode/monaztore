import {
  ApiError,
  Environment,
  extractRejectionReason,
  getEnvironmentConfig,
  getStatus,
  HttpClient,
  lookupTaxpayer,
  submitDocument,
  TokenManager,
} from "@dojocoding/hacienda-sdk";
import type { IdType } from "./comprobante";

/** Hacienda's test environment (sandbox) or the real one. */
export type HaciendaEnvironment = "sandbox" | "production";

export interface Submission {
  clave: string;
  /** As in the XML: `2026-11-08T09:30:00-06:00`. */
  issuedAt: string;
  issuer: { idType: IdType; idNumber: string };
  receiver?: { idType: IdType; idNumber: string };
  signedXml: string;
}

/** What Hacienda says about a document: still checking it, accepted or rejected. */
export type HaciendaVerdict =
  | { state: "pending" }
  | { state: "accepted"; responseXml?: string }
  | { state: "rejected"; responseXml?: string; reason?: string };

/** Sending documents to Hacienda and asking how they went. Tests use a fake one. */
export interface HaciendaGateway {
  /** "received" the first time; "duplicate" when Hacienda already has that clave. */
  submit(submission: Submission): Promise<"received" | "duplicate">;
  status(clave: string): Promise<HaciendaVerdict>;
}

export interface HaciendaCredentials {
  environment: HaciendaEnvironment;
  /** The "usuario" from ATV: `cpf-01-1234-5678@stag.comprobanteselectronicos.go.cr`. */
  username: string;
  password: string;
}

/** Hacienda answered that the user or password are wrong. */
export class HaciendaAuthError extends Error {}

/**
 * Hacienda refused the document outright (400: a malformed document, a date it won't take). The
 * reason is Hacienda's `X-Error-Cause`. Not worth retrying as it is.
 */
export class HaciendaRefusedError extends Error {}

/**
 * The real gateway, over @dojocoding/hacienda-sdk: OAuth with the store's ATV user, then
 * `POST /recepcion` and `GET /recepcion/{clave}`. The token is kept until it expires.
 */
export function createHaciendaGateway(
  credentials: HaciendaCredentials,
  options: { fetch?: typeof fetch } = {},
): HaciendaGateway {
  const envConfig = getEnvironmentConfig(
    credentials.environment === "production" ? Environment.Production : Environment.Sandbox,
  );
  // The SDK drops Hacienda's X-Error-Cause header, which says why a document was refused.
  const baseFetch = options.fetch ?? fetch;
  let lastCause: string | undefined;
  const fetchFn: typeof fetch = async (input, init) => {
    const response = await baseFetch(input, init);
    lastCause = response.headers.get("x-error-cause") ?? undefined;
    return response;
  };
  const tokenManager = new TokenManager({ envConfig, fetchFn });
  const client = new HttpClient({ envConfig, tokenManager, fetchFn });
  let signedIn: Promise<void> | undefined;
  const signIn = () => {
    signedIn ??= tokenManager
      .authenticate({ username: credentials.username, password: credentials.password })
      .catch((error: unknown) => {
        signedIn = undefined;
        throw new HaciendaAuthError(error instanceof Error ? error.message : String(error));
      });
    return signedIn;
  };

  return {
    async submit(submission) {
      await signIn();
      try {
        await submitDocument(client, {
          clave: submission.clave,
          fecha: submission.issuedAt,
          emisor: {
            tipoIdentificacion: submission.issuer.idType,
            numeroIdentificacion: submission.issuer.idNumber,
          },
          ...(submission.receiver
            ? {
                receptor: {
                  tipoIdentificacion: submission.receiver.idType,
                  numeroIdentificacion: submission.receiver.idNumber,
                },
              }
            : {}),
          comprobanteXml: Buffer.from(submission.signedXml, "utf8").toString("base64"),
        });
        return "received";
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (error.statusCode === 409) return "duplicate";
        if (error.statusCode === 400) {
          const cause = lastCause ?? error.message;
          if (/ya (fue|ha sido) recibid|ya existe/i.test(cause)) return "duplicate";
          throw new HaciendaRefusedError(cause);
        }
        if (error.statusCode === 401 || error.statusCode === 403) {
          tokenManager.invalidate();
          signedIn = undefined;
        }
        throw error;
      }
    },
    async status(clave) {
      await signIn();
      const status = await getStatus(client, clave);
      if (status.status === "aceptado")
        return { state: "accepted", responseXml: status.responseXml };
      if (status.status === "rechazado") {
        return {
          state: "rejected",
          responseXml: status.responseXml,
          reason: status.responseXml ? extractRejectionReason(status.responseXml) : undefined,
        };
      }
      return { state: "pending" };
    },
  };
}

/** Checks the ATV user and password by asking Hacienda for a token. */
export async function checkHaciendaCredentials(
  credentials: HaciendaCredentials,
  options: { fetch?: typeof fetch } = {},
): Promise<boolean> {
  const envConfig = getEnvironmentConfig(
    credentials.environment === "production" ? Environment.Production : Environment.Sandbox,
  );
  const tokenManager = new TokenManager({ envConfig, fetchFn: options.fetch });
  try {
    await tokenManager.authenticate({
      username: credentials.username,
      password: credentials.password,
    });
    return true;
  } catch {
    return false;
  }
}

/** A taxpayer as Hacienda's public registry has them, to fill in the store's details. */
export interface Taxpayer {
  name: string;
  idType: string;
  activities: { code: string; description: string }[];
}

/** Looks up an ID in Hacienda's public registry (no sign-in). Undefined if it isn't there. */
export async function findTaxpayer(
  idNumber: string,
  options: { fetch?: typeof fetch } = {},
): Promise<Taxpayer | undefined> {
  try {
    const found = await lookupTaxpayer(idNumber, { fetchFn: options.fetch });
    const active = found.actividades.filter((activity) => activity.estado === "A");
    return {
      name: found.nombre,
      idType: found.tipoIdentificacion,
      activities: (active.length > 0 ? active : found.actividades).map((activity) => ({
        code: activity.codigo,
        description: activity.descripcion,
      })),
    };
  } catch {
    return undefined;
  }
}

/** A good or service of Hacienda's CABYS catalog, with the IVA it carries. */
export interface CabysItem {
  code: string;
  description: string;
  /** Percent, like 13. */
  tax: number;
}

/**
 * Searches Hacienda's public CABYS catalog by words (`https://api.hacienda.go.cr/fe/cabys?q=`).
 * Empty when it finds nothing or Hacienda doesn't answer: the store can type the code instead.
 */
export async function searchCabys(
  query: string,
  options: { fetch?: typeof fetch; limit?: number } = {},
): Promise<CabysItem[]> {
  const url = new URL("https://api.hacienda.go.cr/fe/cabys");
  url.searchParams.set("q", query);
  url.searchParams.set("top", String(options.limit ?? 20));
  try {
    const response = await (options.fetch ?? fetch)(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { cabys?: unknown };
    if (!Array.isArray(body.cabys)) return [];
    return body.cabys.flatMap((item: Record<string, unknown>) => {
      const code = String(item.codigo ?? "");
      if (!/^\d{13}$/.test(code)) return [];
      return [
        { code, description: String(item.descripcion ?? ""), tax: Number(item.impuesto ?? 0) },
      ];
    });
  } catch {
    return [];
  }
}
