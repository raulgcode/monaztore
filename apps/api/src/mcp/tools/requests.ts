import { inquiryStatuses } from "@monaztore/contracts";
import {
  countNewInquiries,
  deleteInquiry,
  getInquiry,
  listInquiries,
  setInquiryStatus,
} from "@monaztore/core";
import { z } from "zod";
import { change, destructive, json, readOnly, storeArg, ToolError, type ToolModule } from "../kit";

const requestId = z.uuid().describe("The request's id, from list_requests");

/** What shoppers send from a page's request form (Requests in the workspace). Anyone on the team. */
export const registerRequestTools: ToolModule = (server, kit) => {
  server.registerTool(
    "list_requests",
    {
      title: "List requests",
      description:
        "Requests shoppers sent from the store's page forms (name, email, phone, message, page), newest first, with how many wait for an answer. status: new (to answer, the default), done or all.",
      inputSchema: {
        store: storeArg,
        status: z.enum([...inquiryStatuses, "all"]).optional(),
        page: z.number().int().min(1).optional(),
      },
      annotations: readOnly,
    },
    kit.tool(
      async ({
        store,
        status,
        page,
      }: {
        store: string;
        status?: "new" | "done" | "all";
        page?: number;
      }) => {
        const tenant = await kit.tenantFor(store);
        const [list, waiting] = await Promise.all([
          listInquiries(tenant, { status, page }),
          countNewInquiries(tenant),
        ]);
        return json({ ...list, waiting, workspace: kit.workspace(store, "/inquiries") });
      },
    ),
  );

  server.registerTool(
    "set_request_status",
    {
      title: "Mark a request answered",
      description:
        "done: answered (it leaves “To answer”); new: back to answer. Only marks it: it sends nothing to the shopper.",
      inputSchema: { store: storeArg, requestId, status: z.enum(inquiryStatuses) },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        requestId: id,
        status,
      }: {
        store: string;
        requestId: string;
        status: "new" | "done";
      }) => {
        const tenant = await kit.tenantFor(store);
        if (!(await getInquiry(tenant, id))) throw new ToolError(`No request ${id} in this store.`);
        await setInquiryStatus(tenant, id, status);
        return json({ saved: true, request: await getInquiry(tenant, id) });
      },
    ),
  );

  server.registerTool(
    "delete_request",
    {
      title: "Delete a request",
      description: "Removes a request for good (spam, a duplicate). Ask before deleting.",
      inputSchema: { store: storeArg, requestId },
      annotations: destructive,
    },
    kit.tool(async ({ store, requestId: id }: { store: string; requestId: string }) => {
      const tenant = await kit.tenantFor(store);
      if (!(await getInquiry(tenant, id))) throw new ToolError(`No request ${id} in this store.`);
      await deleteInquiry(tenant, id);
      return json({ deleted: true });
    }),
  );
};
