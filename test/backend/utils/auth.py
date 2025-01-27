# auth.py
import jwt
from functools import wraps
from flask import request, jsonify, current_app
from bson.objectid import ObjectId


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        logger = current_app.logger

        # Get token from header
        auth_header = request.headers.get('Authorization')

        if not auth_header:
            logger.warning("No Authorization header present")
            return jsonify({'message': 'Token is missing!'}), 401

        try:
            # Extract token from "Bearer <token>"
            token = auth_header.split(" ")[1] if len(auth_header.split(" ")) > 1 else auth_header

            # Decode token
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])

            # Get user from database
            current_user = current_app.mongo.db.users.find_one(
                {"_id": ObjectId(data['user_id'])}
            )

            if not current_user:
                logger.warning(f"User not found for ID: {data['user_id']}")
                return jsonify({'message': 'User not found!'}), 401

        except jwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {str(e)}")
            return jsonify({'message': 'Invalid token!'}), 401
        except Exception as e:
            logger.error(f"Token validation error: {str(e)}")
            return jsonify({'message': 'Token validation failed!'}), 401

        return f(current_user, *args, **kwargs)

    return decorated