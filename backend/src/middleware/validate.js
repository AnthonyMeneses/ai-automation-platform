const { z } = require('zod');
const { AppError } = require('../utils/errors');

// Zod-based request validation. Parsed query lands on req.validatedQuery
// (req.query is left untouched); params and body are replaced with the parsed,
// stripped versions.
function validate({ params, query, body } = {}) {
  return (req, res, next) => {
    try {
      if (params) req.params = params.parse(req.params);
      if (query) req.validatedQuery = query.parse(req.query);
      if (body) req.body = body.parse(req.body);
      return next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return next(
          new AppError(
            400,
            'Validation failed',
            err.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            }))
          )
        );
      }
      return next(err);
    }
  };
}

const uuid = z.string().uuid();

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

module.exports = { validate, z, uuid, pagination };
