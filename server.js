const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { getPool } = require('./config/db');
const { setUserLocals } = require('./middlewares/authMiddleware');

const indexRoutes = require('./routes/indexRoutes');
const authRoutes = require('./routes/authRoutes');
const feirasRoutes = require('./routes/feirasRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessão
app.use(session({
  secret: process.env.SESSION_SECRET || 'feral_secret_session_2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.use(setUserLocals);

// Rotas
app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/feiras', feirasRoutes);

// Rota 404
app.use((req, res) => {
  res.status(404).render('partials/erro-404', {
    title: 'Página Não Encontrada | Fer AL'
  });
});

// Tratamento de erros global
app.use((err, req, res, next) => {
  console.error('Erro interno na aplicação:', err);
  res.status(500).send(`
    <div style="font-family: sans-serif; padding: 2rem; text-align: center;">
      <h2>Ops! Ocorreu um erro interno.</h2>
      <p>${err.message || 'Erro inesperado no servidor.'}</p>
      <a href="/" style="display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; background: #0d9488; color: white; text-decoration: none; border-radius: 6px;">Voltar para o Início</a>
    </div>
  `);
});


app.listen(PORT, async () => {
  console.log(`=========================================`);
  console.log(`Plataforma Fer AL iniciada com sucesso!`);
  console.log(`=========================================`);

  // Testa conexão com o SQL Server
  try {
    await getPool();
  } catch (err) {
    console.warn(`⚠️ Aviso: Não foi possível conectar ao SQL Server de imediato.`);
    console.warn(`👉 Ajuste as credenciais no arquivo .env (DB_USER, DB_PASSWORD, DB_SERVER) conforme seu SSMS.`);
  }
});
