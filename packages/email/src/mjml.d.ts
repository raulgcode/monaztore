// @types/mjml 5 depends on an @types/mjml-core that was never published: just what render.ts uses.
declare module "mjml" {
  interface MjmlError {
    formattedMessage: string;
  }
  interface MjmlOptions {
    validationLevel?: "strict" | "soft" | "skip";
    keepComments?: boolean;
  }
  export default function mjml2html(
    mjml: string,
    options?: MjmlOptions,
  ): Promise<{ html: string; errors: MjmlError[] }>;
}
