// import { Request, Response, NextFunction } from "express";
// import { StatusCodes } from "http-status-codes";
// import { AppError } from "../errors/AppError";
// import { sendApiResponse } from "../utils/sendApiResponse";
// import { logger } from "../lib/logger";

// export function errorHandler(
//   err: unknown,
//   req: Request,
//   res: Response,
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   _next: NextFunction,
// ) {
//   // Operational errors (expected — bad input, auth failure, insufficient
//   // balance) — safe to expose err.message directly to the client.
//   if (err instanceof AppError) {
//     logger.warn(
//       {
//         status: err.status,
//         code: err.code,
//         message: err.message,
//         path: req.path,
//         method: req.method,
//       },
//       "Operational error",
//     );
//     return sendApiResponse(res, {
//       httpStatusCode: err.status,
//       success: false,
//       message: err.message,
//       code: err.code,
//     });
//   }

//   // Unknown errors (bugs, unhandled edge cases) — log full detail
//   // server-side, but never leak internals (stack trace, DB error text)
//   // to the client. Attackers can use raw error messages to fingerprint
//   // the stack or find injection points.
//   logger.error(
//     { err, path: req.path, method: req.method, body: req.body },
//     "Unhandled error",
//   );

//   return sendApiResponse(res, {
//     httpStatusCode: StatusCodes.INTERNAL_SERVER_ERROR,
//     success: false,
//     message: "Internal server error",
//   });
// }
