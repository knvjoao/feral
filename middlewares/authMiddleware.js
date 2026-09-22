const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  req.session.flashMessage = {
    type: 'warning',
    text: 'Você precisa entrar na sua conta para acessar esta área.'
  };
  return res.redirect('/login');
};

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.isAdmin) {
    return next();
  }
  req.session.flashMessage = {
    type: 'danger',
    text: 'Acesso negado: área exclusiva para o Organizador.'
  };
  return res.redirect('/');
};

const setUserLocals = (req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flashMessage = req.session.flashMessage || null;
  delete req.session.flashMessage;

  res.locals.formatDate = (dateVal) => {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal);
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    } catch (e) {
      return String(dateVal);
    }
  };

  res.locals.formatInputDate = (dateVal) => {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return '';
    }
  };

  next();
};

module.exports = {
  requireAuth, requireAdmin, setUserLocals
};
