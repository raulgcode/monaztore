import { describe, expect, it } from "vitest";
import { createHaciendaGateway, HaciendaRefusedError, searchCabys } from "./gateway";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
  });

/** Hacienda's IdP and API, answering each request with what the test says. */
function fakeHacienda(recepcion: (request: Request) => Response) {
  const calls: Request[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push(request);
    if (request.url.includes("/token")) {
      return json({
        access_token: "t",
        refresh_token: "r",
        expires_in: 300,
        refresh_expires_in: 600,
        token_type: "bearer",
      });
    }
    return recepcion(request);
  };
  return { calls, fetchFn };
}

const submission = {
  clave: "5".repeat(50),
  issuedAt: "2026-11-08T09:30:00-06:00",
  issuer: { idType: "01" as const, idNumber: "112340567" },
  signedXml: "<TiqueteElectronico/>",
};

const credentials = {
  environment: "sandbox" as const,
  username: "cpf-01-1234-0567@stag.comprobanteselectronicos.go.cr",
  password: "secreta",
};

describe("Hacienda gateway", () => {
  it("sends the document in base64 with the issuer, signed in with the store's user", async () => {
    const hacienda = fakeHacienda(() => new Response(null, { status: 202 }));
    const gateway = createHaciendaGateway(credentials, { fetch: hacienda.fetchFn });
    expect(await gateway.submit(submission)).toBe("received");
    const post = hacienda.calls.find(
      (call) => call.method === "POST" && call.url.endsWith("/recepcion"),
    );
    const body = (await post?.json()) as { comprobanteXml: string };
    expect(body).toMatchObject({
      clave: submission.clave,
      fecha: submission.issuedAt,
      emisor: { tipoIdentificacion: "01", numeroIdentificacion: "112340567" },
    });
    expect(Buffer.from(body.comprobanteXml, "base64").toString()).toBe("<TiqueteElectronico/>");
    expect(post?.headers.get("authorization")).toBe("Bearer t");
  });

  it("takes a clave Hacienda already has as sent, and explains a refusal with its cause", async () => {
    const duplicate = fakeHacienda(
      () =>
        new Response(null, {
          status: 400,
          headers: { "x-error-cause": "El comprobante ya fue recibido anteriormente" },
        }),
    );
    expect(
      await createHaciendaGateway(credentials, { fetch: duplicate.fetchFn }).submit(submission),
    ).toBe("duplicate");

    const refused = fakeHacienda(
      () =>
        new Response(null, {
          status: 400,
          headers: { "x-error-cause": "La fecha de emisión es inválida" },
        }),
    );
    await expect(
      createHaciendaGateway(credentials, { fetch: refused.fetchFn }).submit(submission),
    ).rejects.toEqual(new HaciendaRefusedError("La fecha de emisión es inválida"));
  });

  it("reads Hacienda's verdict and its reason", async () => {
    const response = Buffer.from(
      "<MensajeHacienda><DetalleMensaje>La cédula no existe</DetalleMensaje></MensajeHacienda>",
    ).toString("base64");
    const hacienda = fakeHacienda(() =>
      json({ clave: submission.clave, "ind-estado": "rechazado", "respuesta-xml": response }),
    );
    const verdict = await createHaciendaGateway(credentials, { fetch: hacienda.fetchFn }).status(
      submission.clave,
    );
    expect(verdict.state).toBe("rejected");
    expect(verdict.state === "rejected" && verdict.responseXml).toContain("La cédula no existe");
  });

  it("finds CABYS codes by words and ignores what isn't a code", async () => {
    const fetchFn: typeof fetch = async () =>
      json({
        cabys: [
          { codigo: "2821100000000", descripcion: "Camisetas de punto", impuesto: 13 },
          { codigo: "abc", descripcion: "broken" },
        ],
      });
    expect(await searchCabys("camiseta", { fetch: fetchFn })).toEqual([
      { code: "2821100000000", description: "Camisetas de punto", tax: 13 },
    ]);
    expect(
      await searchCabys("x", { fetch: async () => new Response("down", { status: 503 }) }),
    ).toEqual([]);
  });
});
