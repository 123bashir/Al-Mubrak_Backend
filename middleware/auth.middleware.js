import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'You are not authenticated!' });
    }

    const resolvedJwtSecret =
        process.env.JWT_SECRET ||
        process.env.USER_JWT_SECRET ||
        process.env.ADMIN_JWT_SECRET;
    const JWT_SECRET = resolvedJwtSecret || "dev_admin_secret_change_me";

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Token is not valid!' });
        }
        req.user = user;
        next();
    });
};

export const verifyUser = (req, res, next) => {
    verifyToken(req, res, () => {
        if (req.user.id === req.params.id || req.user.isAdmin) {
            next();
        } else {
            return res.status(403).json({ success: false, message: 'You are not authorized!' });
        }
    });
};

export const verifyAdmin = (req, res, next) => {
    verifyToken(req, res, () => {
        if (req.user.isAdmin) {
            next();
        } else {
            return res.status(403).json({ success: false, message: 'You are not authorized!' });
        }
    });
};
