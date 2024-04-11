import { Prisma, PrismaClient } from '@prisma/client';
import { enhance } from '@zenstackhq/runtime';
import express, { Request } from 'express';

const prisma = new PrismaClient();
const app = express();

app.use(express.json());

app.use((req, res, next) => {
    const userId = req.header('X-USER-ID');
    if (!userId || Number.isNaN(parseInt(userId))) {
        res.status(403).json({ error: 'unauthorized' });
    } else {
        next();
    }
});

function getUserId(req: Request) {
    return parseInt(req.header('X-USER-ID')!);
}

// Gets a Prisma client bound to the current user identity
function getPrisma(req: Request) {
    return enhance(prisma, {
        user: { id: getUserId(req) },
    });
}

app.post(`/signup`, async (req, res) => {
    const { name, email, posts } = req.body;

    const postData = posts?.map((post: Prisma.PostCreateInput) => {
        return { title: post?.title, content: post?.content };
    });

    const result = await getPrisma(req).user.create({
        data: {
            name,
            email,
            posts: {
                create: postData,
            },
        },
    });
    res.json(result);
});

app.post(`/post`, async (req, res) => {
    console.log('User id:', getUserId(req));
    const { title, content } = req.body;
    const result = await getPrisma(req).post.create({
        data: {
            title,
            content,
            author: { connect: { id: getUserId(req) } },
        },
    });
    res.json(result);
});

app.put('/post/:id/views', async (req, res) => {
    const { id } = req.params;

    try {
        const post = await getPrisma(req).post.update({
            where: { id: Number(id) },
            data: {
                viewCount: {
                    increment: 1,
                },
            },
        });

        res.json(post);
    } catch (error) {
        res.json({
            error: `Post with ID ${id} does not exist in the database`,
        });
    }
});

app.put('/publish/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const postData = await getPrisma(req).post.findUnique({
            where: { id: Number(id) },
            select: {
                published: true,
            },
        });

        const updatedPost = await getPrisma(req).post.update({
            where: { id: Number(id) || undefined },
            data: { published: !postData?.published },
        });
        res.json(updatedPost);
    } catch (error) {
        res.json({
            error: `Post with ID ${id} does not exist in the database`,
        });
    }
});

app.delete(`/post/:id`, async (req, res) => {
    const { id } = req.params;
    const post = await getPrisma(req).post.delete({
        where: {
            id: Number(id),
        },
    });
    res.json(post);
});

app.get('/users', async (req, res) => {
    const users = await getPrisma(req).user.findMany();
    res.json(users);
});

app.get('/user/:id/drafts', async (req, res) => {
    const { id } = req.params;

    const drafts = await getPrisma(req)
        .user.findUnique({
            where: {
                id: Number(id),
            },
        })
        .posts({
            where: { published: false },
        });

    res.json(drafts);
});

app.get(`/post/:id`, async (req, res) => {
    const { id }: { id?: string } = req.params;

    const post = await getPrisma(req).post.findUnique({
        where: { id: Number(id) },
    });
    res.json(post);
});

app.get(`/post`, async (req, res) => {
    const post = await getPrisma(req).post.findMany({
        include: { author: true },
    });
    res.json(post);
});

app.get('/feed', async (req, res) => {
    const { searchString, skip, take, orderBy } = req.query;

    const or: Prisma.PostWhereInput = searchString
        ? {
              OR: [
                  { title: { contains: searchString as string } },
                  { content: { contains: searchString as string } },
              ],
          }
        : {};

    const posts = await getPrisma(req).post.findMany({
        where: {
            published: true,
            ...or,
        },
        include: { author: true },
        take: Number(take) || undefined,
        skip: Number(skip) || undefined,
        orderBy: {
            updatedAt: orderBy as Prisma.SortOrder,
        },
    });

    res.json(posts);
});

const server = app.listen(3000, () =>
    console.log(`
🚀 Server ready at: http://localhost:3000
⭐️ See sample requests: http://pris.ly/e/ts/rest-express#3-using-the-rest-api`)
);
