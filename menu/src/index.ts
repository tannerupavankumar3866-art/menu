import { Hono } from 'hono'
import { cors } from 'hono/cors';
import allRoutes from './routes';

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Nizam!')
});
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS","PATCH"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);
app.route('/api',allRoutes);

export default app