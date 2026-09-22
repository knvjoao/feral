const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');

async function getCategorias() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT id, nome FROM Categorias ORDER BY nome ASC');
  return result.recordset;
}

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();

    const proximasFeirasPromise = pool.request().query(`
      SELECT TOP 6 
        f.id, 
        f.nome, 
        f.descricao, 
        CONVERT(VARCHAR(10), f.data_evento, 23) AS data_evento, 
        f.horario, 
        f.local, 
        f.tipo_produtos, 
        c.nome AS categoria_nome
      FROM Feiras f
      INNER JOIN Categorias c ON f.categoria_id = c.id
      WHERE f.data_evento >= CAST(GETDATE() AS DATE)
      ORDER BY f.data_evento ASC, f.horario ASC
    `);

    const [proximasFeirasResult, categorias] = await Promise.all([
      proximasFeirasPromise,
      getCategorias()
    ]);

    const listaFeiras = proximasFeirasResult.recordset;
    const ticket = req.session.ticketGerado || null;
    if (req.session.ticketGerado) {
      delete req.session.ticketGerado;
    }

    return res.render('index', {
      title: 'Fer AL | Descubra Feiras de Artesanato e Cultura em Alagoas',
      feiras: listaFeiras,
      proximasFeiras: listaFeiras,
      categorias,
      ticketGerado: ticket
    });
  } catch (error) {
    console.error('Erro ao carregar página inicial:', error);
    return res.render('index', {
      title: 'Fer AL | Descubra Feiras de Artesanato e Cultura em Alagoas',
      feiras: [],
      proximasFeiras: [],
      categorias: [],
      ticketGerado: null
    });
  }
});

router.get('/agenda', async (req, res) => {
  try {
    const pool = await getPool();
    const busca = (req.query.busca || '').trim();
    const localFiltro = (req.query.local || '').trim();
    const dataFiltro = (req.query.data || '').trim();
    const categoriaId = parseInt(req.query.categoria, 10);

    let query = `
      SELECT 
        f.id, 
        f.nome, 
        f.descricao, 
        CONVERT(VARCHAR(10), f.data_evento, 23) AS data_evento, 
        f.horario, 
        f.local, 
        f.tipo_produtos, 
        c.nome AS categoria_nome
      FROM Feiras f
      INNER JOIN Categorias c ON f.categoria_id = c.id
      WHERE 1=1
    `;

    const request = pool.request();

    if (!isNaN(categoriaId) && categoriaId > 0) {
      query += ` AND f.categoria_id = @categoriaId`;
      request.input('categoriaId', sql.Int, categoriaId);
    }

    if (dataFiltro) {
      query += ` AND f.data_evento = CAST(@dataFiltro AS DATE)`;
      request.input('dataFiltro', sql.VarChar(10), dataFiltro);
    }

    if (localFiltro) {
      query += ` AND f.local LIKE @localFiltro`;
      request.input('localFiltro', sql.NVarChar(200), `%${localFiltro}%`);
    }

    if (busca) {
      query += ` AND (f.nome LIKE @busca OR f.local LIKE @busca OR f.tipo_produtos LIKE @busca OR f.descricao LIKE @busca)`;
      request.input('busca', sql.NVarChar(200), `%${busca}%`);
    }

    query += ` ORDER BY f.data_evento ASC, f.horario ASC`;

    const [feirasResult, categorias] = await Promise.all([
      request.query(query),
      getCategorias()
    ]);

    const categoriaSelecionada = isNaN(categoriaId) ? '' : String(categoriaId);

    const filtros = {
      categoria: categoriaSelecionada,
      data: dataFiltro,
      local: localFiltro,
      busca: busca
    };

    return res.render('agenda', {
      title: 'Agenda de Feiras | Fer AL',
      feiras: feirasResult.recordset,
      categorias,
      busca,
      categoriaSelecionada,
      filtros
    });
  } catch (error) {
    console.error('Erro ao carregar agenda:', error);
    req.session.flashMessage = {
      type: 'danger',
      text: 'Não foi possível carregar a agenda de feiras. Tente novamente mais tarde.'
    };
    return res.redirect('/');
  }
});

router.get('/fale-conosco', (req, res) => {
  return res.redirect('/#fale-conosco');
});

router.post('/fale-conosco', async (req, res) => {
  const { nome, email, mensagem } = req.body;

  if (!nome || !email || !mensagem) {
    req.session.flashMessage = {
      type: 'danger',
      text: 'Por favor, preencha todos os campos do formulário.'
    };
    return res.redirect('/#fale-conosco');
  }

  const numeroProtocolo = 'TK-' + Math.floor(100000 + Math.random() * 900000);

  req.session.ticketGerado = {
    nome: nome.trim(),
    codigo: numeroProtocolo
  };

  return res.redirect('/#fale-conosco');
});

module.exports = router;