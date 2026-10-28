import { Router } from 'express';
import { ClassController } from '../controllers/ClassController.js';
import { StudentController } from '../controllers/StudentController.js';
import { AttendanceController } from '../controllers/AttendanceController.js';
import { AuthController } from '../controllers/AuthController.js';
import { EventController } from '../controllers/EventController.js';
import { IncidentController } from '../controllers/IncidentController.js';
import { DashboardController } from '../controllers/DashboardController.js';
import { SchoolController } from '../controllers/SchoolController.js';
import { UserController } from '../controllers/UserController.js';
import { upload } from '../middlewares/upload.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const routes = Router();

// Rotas Públicas
routes.get('/api/status', (req, res) => {
  res.json({ message: "O backend do PresenSee está ativo!" });
});
routes.post('/api/login', AuthController.login);
routes.post('/api/setup', AuthController.setup); 

// Middleware de Autenticação (Requer Token JWT)
routes.use(authMiddleware);

// Rotas Protegidas

// Dashboard
routes.get('/api/dashboard', DashboardController.getSummary);

// Escolas (Admin)
routes.post('/api/escolas', SchoolController.create);
routes.get('/api/escolas', SchoolController.index);
routes.patch('/api/escolas/:id/status', SchoolController.updateStatus);
routes.delete('/api/escolas/:id', SchoolController.delete);

// Usuários / Gestores (Admin)
routes.post('/api/users', UserController.create);
routes.get('/api/users', UserController.index);

// Turmas
routes.post('/api/classes', ClassController.create);
routes.get('/api/classes', ClassController.index);

// Alunos
routes.post('/api/students', StudentController.create);
routes.get('/api/students', StudentController.index); 
routes.patch('/api/students/:id/biometry', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      console.error("Erro no upload:", err);
      return res.status(500).json({ error: "Falha no upload", detalhes: err.message || err });
    }
    next();
  });
}, StudentController.uploadBiometry);
routes.get('/api/students/:id/attendance-history', StudentController.attendanceHistory); 

// Frequência e Alertas
routes.post('/api/attendances', AttendanceController.create);
routes.get('/api/alerts', AttendanceController.listAlerts);

// Ocorrências
routes.get('/api/incidents', IncidentController.index);
routes.post('/api/incidents', IncidentController.create);
routes.patch('/api/incidents/:id', IncidentController.update);
routes.delete('/api/incidents/:id', IncidentController.delete);

// Eventos
routes.get('/api/events', EventController.index);
routes.post('/api/events', EventController.create);
routes.delete('/api/events/:id', EventController.delete);

export default routes;