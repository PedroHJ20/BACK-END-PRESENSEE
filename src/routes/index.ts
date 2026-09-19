import { Router } from 'express';
import { ClassController } from '../controllers/ClassController.js';
import { StudentController } from '../controllers/StudentController.js';
import { AttendanceController } from '../controllers/AttendanceController.js';
import { AuthController } from '../controllers/AuthController.js';
import { upload } from '../middlewares/upload.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // 1. Importamos o segurança

const routes = Router();


routes.get('/api/status', (req, res) => {
  res.json({ message: "O backend do PresenSee está vivo e estruturado!" });
});

routes.post('/api/login', AuthController.login);



routes.use(authMiddleware);



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