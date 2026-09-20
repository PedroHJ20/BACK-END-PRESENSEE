import { Router } from 'express';
import { ClassController } from '../controllers/ClassController.js';
import { StudentController } from '../controllers/StudentController.js';
import { AttendanceController } from '../controllers/AttendanceController.js';
import { AuthController } from '../controllers/AuthController.js';
import { upload } from '../middlewares/upload.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const routes = Router();

// ==========================================
// ZONA PÚBLICA (Qualquer um pode acessar)
// ==========================================
routes.get('/api/status', (req, res) => {
  res.json({ message: "O backend do PresenSee está vivo e estruturado!" });
});

routes.post('/api/login', AuthController.login);

// ROTA TEMPORÁRIA: Recriar o administrador após o reset do banco
// ATENÇÃO: Apague esta linha assim que recriar o usuário no api.http!



// ==========================================
// CATRACA ELETRÔNICA
// ==========================================
// A partir desta linha, TODAS as rotas exigem o Token JWT no cabeçalho
routes.use(authMiddleware);


// ==========================================
// ZONA PROTEGIDA (Acesso restrito)
// ==========================================
// Turmas
routes.post('/api/classes', ClassController.create);
routes.get('/api/classes', ClassController.index);

// Alunos e Histórico
routes.post('/api/students', StudentController.create);
routes.get('/api/students', StudentController.index); 
routes.patch('/api/students/:id/biometry', upload.single('photo'), StudentController.uploadBiometry);
routes.get('/api/students/:id/attendance-history', StudentController.attendanceHistory); 

// Frequência e Alertas
routes.post('/api/attendances', AttendanceController.create);
routes.get('/api/alerts', AttendanceController.listAlerts);

export default routes;