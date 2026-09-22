const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { sql, getPool } = require('../config/db');
const { requireAuth } = require('../middlewares/authMiddleware');

function checkIsAdmin(email) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  return Boolean(adminEmail) && (email || '').trim().toLowerCase() === adminEmail;
}

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/perfil');
  return res.render('login', {
    title: 'Login / Cadastro | Fer AL',
    tab: req.query.tab || 'login',
    email: ''
  });
});

router.get('/cadastro', (req, res) => {
  if (req.session.user) return res.redirect('/perfil');
  return res.render('cadastro', {
    title: 'Cadastro de visitante | Fer AL',
    nome: '',
    email: ''
  });
});

router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  const emailFormatado = (email || '').trim().toLowerCase();

  try {
    if (!emailFormatado || !senha) {
      return res.render('login', {
        title: 'Login / Cadastro | Fer AL',
        tab: 'login',
        email: emailFormatado,
        flashMessage: { type: 'danger', text: 'Por favor, preencha o e-mail e a senha.' }
      });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('email', sql.NVarChar(150), emailFormatado)
      .query('SELECT id, nome, email, senha FROM Usuarios WHERE LOWER(email) = @email');

    const usuario = result.recordset[0];
    const senhaValida = usuario && await bcrypt.compare(senha, usuario.senha);

    if (!senhaValida) {
      return res.render('login', {
        title: 'Login / Cadastro | Fer AL',
        tab: 'login',
        email: emailFormatado,
        flashMessage: { type: 'danger', text: 'E-mail ou senha incorretos.' }
      });
    }

    const isAdmin = checkIsAdmin(usuario.email);

    req.session.user = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email.toLowerCase(),
      isAdmin
    };

    req.session.flashMessage = {
      type: 'success',
      text: `Bem-vindo de volta, ${usuario.nome}!${isAdmin ? ' (Acesso de organizador ativado)' : ''}`
    };

    return res.redirect('/perfil');
  } catch (error) {
    console.error('Erro no login:', error);
    return res.render('login', {
      title: 'Login / Cadastro | Fer AL',
      tab: 'login',
      email: emailFormatado,
      flashMessage: { type: 'danger', text: 'Erro ao processar o login. Verifique a conexão com o banco de dados.' }
    });
  }
});

router.post('/cadastro', async (req, res) => {
  const { nome, email, senha, confirmar_senha } = req.body;
  const nomeFormatado = (nome || '').trim();
  const emailFormatado = (email || '').trim().toLowerCase();

  if (!nomeFormatado || !emailFormatado || !senha) {
    return res.render('cadastro', {
      title: 'Cadastro de visitante | Fer AL',
      nome: nomeFormatado,
      email: emailFormatado,
      flashMessage: { type: 'danger', text: 'Todos os campos obrigatórios devem ser preenchidos.' }
    });
  }

  if (senha.length < 6) {
    return res.render('cadastro', {
      title: 'Cadastro de visitante | Fer AL',
      nome: nomeFormatado,
      email: emailFormatado,
      flashMessage: { type: 'danger', text: 'A senha deve conter no mínimo 6 caracteres.' }
    });
  }

  if (confirmar_senha && senha !== confirmar_senha) {
    return res.render('cadastro', {
      title: 'Cadastro de visitante | Fer AL',
      nome: nomeFormatado,
      email: emailFormatado,
      flashMessage: { type: 'danger', text: 'Senhas informadas não coincidem.' }
    });
  }

  let transaction = null;

  try {
    const pool = await getPool();

    const existe = await pool.request()
      .input('email', sql.NVarChar(150), emailFormatado)
      .query('SELECT id FROM Usuarios WHERE LOWER(email) = @email');

    if (existe.recordset.length > 0) {
      return res.render('cadastro', {
        title: 'Cadastro de visitante | Fer AL',
        nome: nomeFormatado,
        email: emailFormatado,
        flashMessage: { type: 'danger', text: 'E-mail já cadastrado. Por favor, escolha outro.' }
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const insertUserReq = new sql.Request(transaction);
    const insertResult = await insertUserReq
      .input('nome', sql.NVarChar(150), nomeFormatado)
      .input('email', sql.NVarChar(150), emailFormatado)
      .input('senha', sql.NVarChar(255), senhaHash)
      .query(`
        INSERT INTO Usuarios (nome, email, senha, criado_em)
        OUTPUT INSERTED.id
        VALUES (@nome, @email, @senha, GETDATE())
      `);

    const novoId = insertResult.recordset[0].id;

    const insertNotifReq = new sql.Request(transaction);
    await insertNotifReq
      .input('usuario_id', sql.Int, novoId)
      .input('mensagem', sql.NVarChar(sql.MAX), `Olá, ${nomeFormatado}! Seja bem-vindo(a) ao Fer AL. Inscreva-se nas feirinhas para receber notificações.`)
      .query(`
        INSERT INTO Notificacoes (usuario_id, mensagem, lida, criado_em)
        VALUES (@usuario_id, @mensagem, 0, GETDATE())
      `);

    await transaction.commit();

    const isAdmin = checkIsAdmin(emailFormatado);

    req.session.user = {
      id: novoId,
      nome: nomeFormatado,
      email: emailFormatado,
      isAdmin
    };

    req.session.flashMessage = {
      type: 'success',
      text: 'Conta criada com sucesso! Bem-vindo(a) ao Fer AL.'
    };

    return res.redirect('/perfil');
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rbErr) {
        console.error('Erro ao reverter transação:', rbErr);
      }
    }
    console.error('Erro no cadastro:', error);
    return res.render('cadastro', {
      title: 'Cadastro de visitante | Fer AL',
      nome: nomeFormatado,
      email: emailFormatado,
      flashMessage: { type: 'danger', text: 'Não foi possível concluir seu cadastro. Tente novamente mais tarde.' }
    });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

router.get('/perfil', requireAuth, async (req, res) => {
  try {
    const usuarioId = req.session.user.id;
    const pool = await getPool();

    const inscricoesPromise = pool.request()
      .input('usuario_id', sql.Int, usuarioId)
      .query(`
        SELECT 
          i.id AS inscricao_id,
          i.criado_em AS inscricao_data,
          f.id AS feira_id,
          f.nome,
          f.descricao,
          CONVERT(VARCHAR(10), f.data_evento, 23) AS data_evento,
          f.horario,
          f.local,
          f.tipo_produtos,
          c.nome AS categoria_nome
        FROM InscricoesNotificacoes i
        INNER JOIN Feiras f ON i.feira_id = f.id
        INNER JOIN Categorias c ON f.categoria_id = c.id
        WHERE i.usuario_id = @usuario_id
        ORDER BY f.data_evento ASC, f.horario ASC
      `);

    const notificacoesPromise = pool.request()
      .input('usuario_id', sql.Int, usuarioId)
      .query(`
        SELECT id, mensagem, lida, criado_em
        FROM Notificacoes
        WHERE usuario_id = @usuario_id
        ORDER BY criado_em DESC
      `);

    const feirasDisponiveisPromise = pool.request()
      .input('usuario_id', sql.Int, usuarioId)
      .query(`
        SELECT 
          f.id,
          f.nome,
          CONVERT(VARCHAR(10), f.data_evento, 23) AS data_evento,
          f.horario,
          f.local,
          c.nome AS categoria_nome
        FROM Feiras f
        INNER JOIN Categorias c ON f.categoria_id = c.id
        WHERE f.id NOT IN (
          SELECT feira_id FROM InscricoesNotificacoes WHERE usuario_id = @usuario_id
        )
        ORDER BY f.data_evento ASC
      `);

    const [inscricoesResult, notificacoesResult, feirasDisponiveisResult] = await Promise.all([
      inscricoesPromise, notificacoesPromise, feirasDisponiveisPromise
    ]);

    return res.render('perfil', {
      title: 'Meu Perfil | Fer AL',
      inscricoes: inscricoesResult.recordset,
      notificacoes: notificacoesResult.recordset,
      feirasDisponiveis: feirasDisponiveisResult.recordset
    });
  } catch (error) {
    console.error('Erro ao carregar perfil:', error);
    req.session.flashMessage = {
      type: 'danger',
      text: 'Não foi possível carregar as informações do perfil.'
    };
    return res.redirect('/');
  }
});

router.post('/notificacoes/:id/lida', requireAuth, async (req, res) => {
  try {
    const notificacaoId = parseInt(req.params.id, 10);
    if (!isNaN(notificacaoId)) {
      const pool = await getPool();
      await pool.request()
        .input('id', sql.Int, notificacaoId)
        .input('usuario_id', sql.Int, req.session.user.id)
        .query('UPDATE Notificacoes SET lida = 1 WHERE id = @id AND usuario_id = @usuario_id');
    }
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
    req.session.flashMessage = {
      type: 'danger',
      text: 'Não foi possível atualizar a notificação.'
    };
  }
  return res.redirect('/perfil#notificacoes');
});

router.post('/notificacoes/ler-todas', requireAuth, async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('usuario_id', sql.Int, req.session.user.id)
      .query('UPDATE Notificacoes SET lida = 1 WHERE usuario_id = @usuario_id');

    req.session.flashMessage = {
      type: 'success',
      text: 'Todas as notificações foram marcadas como lidas.'
    };
  } catch (error) {
    console.error('Erro ao marcar todas as notificações:', error);
    req.session.flashMessage = {
      type: 'danger',
      text: 'Não foi possível atualizar as notificações.'
    };
  }
  return res.redirect('/perfil#notificacoes');
});

module.exports = router;