/**
 * Generic validation middleware runner.
 * Takes an array of validation rules and returns an express middleware.
 */
export const validate = (rules) => {
  return (req, res, next) => {
    const errors = [];
    for (const rule of rules) {
      const error = rule(req);
      if (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    next();
  };
};

export default validate;
