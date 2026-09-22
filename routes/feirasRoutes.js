const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middlewares/authMiddleware');

async function getCategorias() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT id, nome FROM Categorias ORDER BY nome ASC');
  return result.recordset;
}

router.get('/criar', requireAdmin, async (req, res) => {
  try {
    const categorias = await getCategorias();

    return res.render('feira-form', {
      title: 'Cadastrar Nova Feira | Fer AL',
      isEdit: false,
      action: '/feiras/criar',
      feira: {},
      categorias
    });
  } catch (error) {
    console.error('Erro ao carregar formulário de criação de feira:', error);
    req.session.flashMessage = {
      type: 'danger',
      text: 'Não foi possível carregar o formulário. Verifique a conexão com o banco de dados.'
    };
    return res.redirect('/agenda');
  }
});

router.post('/criar', requireAdmin, async (req, res) => {
  const { nome, descricao, data_evento, horario, local, tipo_produtos, categoria_id } = req.body;
  const categoriaId = parseInt(categoria_id, 10);

  if (!nome || !data_evento || !horario || !local || !tipo_produtos || isNaN(categoriaId)) {
    const categorias = await getCategorias();
    return res.render('feira-form', {
      title: 'Cadastrar Nova Feira | Fer AL',
      isEdit: false,
      action: '/feiras/criar',
      feira: req.body,
      categorias,
      flashMessage: { type: 'danger', text: 'Por favor, preencha todos os campos obrigatórios corretamente.' }
    });
  }

  try {
    const pool = await getPool();
    const insertResult = await pool.request()
      .input('nome', sql.NVarChar(150), nome.trim())
      .input('descricao', sql.NVarChar(sql.MAX), (descricao || '').trim())
      .input('data_evento', sql.VarChar(10), data_evento)
      .input('horario', sql.NVarChar(50), horario.trim())
      .input('local', sql.NVarChar(200), local.trim())
      .input('tipo_produtos', sql.NVarChar(200), tipo_produtos.trim())
      .input('categoria_id', sql.Int, categoriaId)
      .query(`
        INSERT INTO Feiras (nome, descricao, data_evento, horario, local, tipo_produtos, categoria_id, criado_em)
        OUTPUT INSERTED.id
        VALUES (@nome, @descricao, CAST(@data_evento AS DATE), @horario, @local, @tipo_produtos, @categoria_id, GETDATE())
      `);

    const novaFeiraId = insertResult.recordset[0].id;

    req.session.flashMessage = {
      type: 'success',
      text: `Feira "${nome}" cadastrada com sucesso na plataforma!`
    };

    return res.redirect(`/feiras/${novaFeiraId}`);
  } catch (error) {
    console.error('Erro ao criar feira:', error);
    const categorias = await getCategorias();
    return res.render('feira-form', {
      title: 'Cadastrar Nova Feira | Fer AL',
      isEdit: false,
      action: '/feiras/criar',
      feira: req.body,
      categorias,
      flashMessage: { type: 'danger', text: 'Erro ao salvar a feira no banco de dados.' }
    });
  }
});

router.get('/editar/:id', requireAdmin, async (req, res) => {
  try {
    const feiraId = parseInt(req.params.id, 10);
    if (isNaN(feiraId)) return res.redirect('/agenda');

    const pool = await getPool();
    const [feiraResult, categorias] = await Promise.all([
      pool.request()
        .input('id', sql.Int, feiraId)
        .query(`
          SELECT 
            id, 
            nome, 
            descricao, 
            CONVERT(VARCHAR(10), data_evento, 23) AS data_evento, 
            horario, 
            local, 
            tipo_produtos, 
            categoria_id 
          FROM Feiras 
          WHERE id = @id
        `),
      getCategorias()
    ]);

    const feira = feiraResult.recordset[0];

    if (!feira) {
      req.session.flashMessage = { type: 'danger', text: 'Feira não encontrada.' };
      return res.redirect('/agenda');
    }

    return res.render('feira-form', {
      title: `Editar Feira: ${feira.nome} | Fer AL`,
      isEdit: true,
      action: `/feiras/editar/${feira.id}`,
      feira: feira,
      categorias
    });
  } catch (error) {
    console.error('Erro ao carregar edição de feira:', error);
    req.session.flashMessage = { type: 'danger', text: 'Erro ao carregar dados para edição.' };
    return res.redirect('/agenda');
  }
});

router.post('/editar/:id', requireAdmin, async (req, res) => {
  const feiraId = parseInt(req.params.id, 10);
  if (isNaN(feiraId)) return res.redirect('/agenda');

  const { nome, descricao, data_evento, horario, local, tipo_produtos, categoria_id } = req.body;
  const categoriaId = parseInt(categoria_id, 10);

  if (!nome || !data_evento || !horario || !local || !tipo_produtos || isNaN(categoriaId)) {
    const categorias = await getCategorias();
    return res.render('feira-form', {
      title: `Editar Feira | Fer AL`,
      isEdit: true,
      action: `/feiras/editar/${feiraId}`,
      feira: { ...req.body, id: feiraId },
      categorias,
      flashMessage: { type: 'danger', text: 'Por favor, preencha todos os campos obrigatórios corretamente.' }
    });
  }

  let transaction = null;

  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const updateReq = new sql.Request(transaction);
    await updateReq
      .input('id', sql.Int, feiraId)
      .input('nome', sql.NVarChar(150), nome.trim())
      .input('descricao', sql.NVarChar(sql.MAX), (descricao || '').trim())
      .input('data_evento', sql.VarChar(10), data_evento)
      .input('horario', sql.NVarChar(50), horario.trim())
      .input('local', sql.NVarChar(200), local.trim())
      .input('tipo_produtos', sql.NVarChar(200), tipo_produtos.trim())
      .input('categoria_id', sql.Int, categoriaId)
      .query(`
        UPDATE Feiras
        SET 
          nome = @nome,
          descricao = @descricao,
          data_evento = CAST(@data_evento AS DATE),
          horario = @horario,
          local = @local,
          tipo_produtos = @tipo_produtos,
          categoria_id = @categoria_id
        WHERE id = @id
      `);

    const notifReq = new sql.Request(transaction);
    const mensagemNotificacao = `Atualização: As informações da feira "${nome.trim()}" foram atualizadas pelo organizador!`;
    await notifReq
      .input('feira_id', sql.Int, feiraId)
      .input('mensagem', sql.NVarChar(sql.MAX), mensagemNotificacao)
      .query(`
        INSERT INTO Notificacoes (usuario_id, mensagem, lida, criado_em)
        SELECT usuario_id, @mensagem, 0, GETDATE()
        FROM InscricoesNotificacoes
        WHERE feira_id = @feira_id
      `);

    await transaction.commit();

    req.session.flashMessage = {
      type: 'success',
      text: `Feira "${nome}" atualizada com sucesso! Notificações enviadas aos inscritos.`
    };

    return res.redirect(`/feiras/${feiraId}`);
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rbErr) {
        console.error('Erro ao reverter transação:', rbErr);
      }
    }
    console.error('Erro ao atualizar feira:', error);
    const categorias = await getCategorias();
    return res.render('feira-form', {
      title: `Editar Feira | Fer AL`,
      isEdit: true,
      action: `/feiras/editar/${feiraId}`,
      feira: { ...req.body, id: feiraId },
      categorias,
      flashMessage: { type: 'danger', text: 'Ocorreu um erro ao atualizar os dados da feira.' }
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const feiraId = parseInt(req.params.id, 10);
    if (isNaN(feiraId)) return res.redirect('/agenda');

    const pool = await getPool();

    const feiraPromise = pool.request()
      .input('id', sql.Int, feiraId)
      .query(`
        SELECT 
          f.id, 
          f.nome, 
          f.descricao, 
          CONVERT(VARCHAR(10), f.data_evento, 23) AS data_evento, 
          f.horario, 
          f.local, 
          f.tipo_produtos, 
          f.categoria_id, 
          f.criado_em,
          c.nome AS categoria_nome
        FROM Feiras f
        INNER JOIN Categorias c ON f.categoria_id = c.id
        WHERE f.id = @id
      `);

    const inscricaoPromise = req.session.user
      ? pool.request()
          .input('usuario_id', sql.Int, req.session.user.id)
          .input('feira_id', sql.Int, feiraId)
          .query(`
            SELECT id FROM InscricoesNotificacoes 
            WHERE usuario_id = @usuario_id AND feira_id = @feira_id
          `)
      : Promise.resolve(null);

    const totalInscritosPromise = pool.request()
      .input('feira_id', sql.Int, feiraId)
      .query(`SELECT COUNT(*) AS total FROM InscricoesNotificacoes WHERE feira_id = @feira_id`);

    const [feiraResult, inscricaoCheck, totalInscritosResult] = await Promise.all([
      feiraPromise, inscricaoPromise, totalInscritosPromise
    ]);

    const feira = feiraResult.recordset[0];

    if (!feira) {
      req.session.flashMessage = { type: 'danger', text: 'Feira não encontrada no sistema.' };
      return res.redirect('/agenda');
    }

    const estaInscrito = inscricaoCheck ? inscricaoCheck.recordset.length > 0 : false;
    const totalInscritos = totalInscritosResult.recordset[0].total;

    return res.render('feira-detalhes', {
      title: `${feira.nome} | Fer AL`,
      feira,
      estaInscrito,
      totalInscritos
    });
  } catch (error) {
    console.error('Erro ao buscar detalhes da feira:', error);
    req.session.flashMessage = { type: 'danger', text: 'Não foi possível carregar os detalhes da feira no momento.' };
    return res.redirect('/agenda');
  }
});

router.post('/:id/inscrever', requireAuth, async (req, res) => {
  const feiraId = parseInt(req.params.id, 10);
  if (isNaN(feiraId)) return res.redirect('/agenda');

  const usuarioId = req.session.user.id;
  let transaction = null;

  try {
    const pool = await getPool();

    const check = await pool.request()
      .input('usuario_id', sql.Int, usuarioId)
      .input('feira_id', sql.Int, feiraId)
      .query(`
        SELECT id FROM InscricoesNotificacoes 
        WHERE usuario_id = @usuario_id AND feira_id = @feira_id
      `);

    if (check.recordset.length === 0) {
      const feiraRes = await pool.request()
        .input('id', sql.Int, feiraId)
        .query(`SELECT nome FROM Feiras WHERE id = @id`);
      const feiraNome = feiraRes.recordset[0] ? feiraRes.recordset[0].nome : 'Feira';

      transaction = new sql.Transaction(pool);
      await transaction.begin();

      const insInscricaoReq = new sql.Request(transaction);
      await insInscricaoReq
        .input('usuario_id', sql.Int, usuarioId)
        .input('feira_id', sql.Int, feiraId)
        .query(`
          INSERT INTO InscricoesNotificacoes (usuario_id, feira_id, criado_em)
          VALUES (@usuario_id, @feira_id, GETDATE())
        `);

      const insNotifReq = new sql.Request(transaction);
      await insNotifReq
        .input('usuario_id', sql.Int, usuarioId)
        .input('mensagem', sql.NVarChar(sql.MAX), `Você se inscreveu para receber notificações da feira: "${feiraNome}".`)
        .query(`
          INSERT INTO Notificacoes (usuario_id, mensagem, lida, criado_em)
          VALUES (@usuario_id, @mensagem, 0, GETDATE())
        `);

      await transaction.commit();

      req.session.flashMessage = {
        type: 'success',
        text: `Inscrição confirmada! Você receberá atualizações sobre a feira "${feiraNome}".`
      };
    } else {
      req.session.flashMessage = {
        type: 'info',
        text: 'Você já está inscrito para receber notificações desta feira.'
      };
    }

    return res.redirect(`/feiras/${feiraId}`);
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rbErr) {
        console.error('Erro ao reverter transação:', rbErr);
      }
    }
    console.error('Erro ao inscrever usuário na feira:', error);
    req.session.flashMessage = { type: 'danger', text: 'Erro ao realizar inscrição. Tente novamente.' };
    return res.redirect(`/feiras/${feiraId}`);
  }
});

router.post('/:id/desinscrever', requireAuth, async (req, res) => {
  const feiraId = parseInt(req.params.id, 10);
  if (isNaN(feiraId)) return res.redirect('/agenda');

  try {
    const usuarioId = req.session.user.id;
    const pool = await getPool();

    await pool.request()
      .input('usuario_id', sql.Int, usuarioId)
      .input('feira_id', sql.Int, feiraId)
      .query(`
        DELETE FROM InscricoesNotificacoes 
        WHERE usuario_id = @usuario_id AND feira_id = @feira_id
      `);

    req.session.flashMessage = {
      type: 'info',
      text: 'Inscrição cancelada. Você não receberá mais notificações sobre esta feira.'
    };

    return res.redirect(`/feiras/${feiraId}`);
  } catch (error) {
    console.error('Erro ao cancelar inscrição:', error);
    req.session.flashMessage = { type: 'danger', text: 'Erro ao cancelar inscrição.' };
    return res.redirect(`/feiras/${feiraId}`);
  }
});

module.exports = router;