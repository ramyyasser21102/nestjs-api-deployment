import * as bcrypt from 'bcrypt';
import { dataSource } from '../db/data-source';
import { User } from '../user/user.entity';

const SALT_ROUNDS = 10;

const seedUsers: Pick<User, 'name' | 'email' | 'password'>[] = [
  { name: 'Admin User', email: 'admin@example.com', password: 'Admin123!' },
  { name: 'Test User', email: 'test@example.com', password: 'Test123!' },
  { name: 'John Doe', email: 'john.doe@example.com', password: 'John123!' },
  { name: 'Jane Smith', email: 'jane.smith@example.com', password: 'Jane123!' },
];

async function seed(): Promise<void> {
  await dataSource.initialize();
  const repo = dataSource.getRepository(User);

  for (const data of seedUsers) {
    const exists = await repo.findOneBy({ email: data.email });
    if (exists) {
      console.log(`Skip: ${data.email} already exists`);
      continue;
    }

    const user = repo.create({
      ...data,
      password: await bcrypt.hash(data.password, SALT_ROUNDS),
    });

    await repo.save(user);
    console.log(`Seeded: ${user.email} (id=${user.id})`);
  }

  await dataSource.destroy();
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
