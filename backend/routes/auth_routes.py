from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
from datetime import datetime, timedelta, timezone
from bson.objectid import ObjectId
from utils.auth import token_required

auth_routes = Blueprint('auth_routes', __name__)



@auth_routes.route('/login', methods=['POST'])
def login():
    try:
        # Get logger and mongo instances
        logger = current_app.logger
        users = current_app.mongo.db.users

        # Log login attempt
        logger.debug("Processing login request")

        # Extract data from request
        data = request.get_json()
        if not data:
            logger.error("No JSON data in request")
            return jsonify({"error": "Missing request data"}), 400

        username = data.get('username')
        password = data.get('password')
        user_type = data.get('user_type')

        if not all([username, password, user_type]):
            logger.error("Missing required fields")
            return jsonify({"error": "Missing required fields"}), 400

        # Find user
        user = users.find_one({"username": username, "user_type": user_type})
        logger.debug(f"User lookup completed for username: {username}")

        if user and check_password_hash(user['password'], password):
            # Generate token
            token = jwt.encode({
                'user_id': str(user['_id']),
                'user_type': user['user_type'],
                'exp': datetime.now(timezone.utc) + timedelta(hours=24)
            }, current_app.config['SECRET_KEY'], algorithm="HS256")

            # Prepare response
            response = {
                "message": "Logged in successfully",
                "token": token,
                "user_type": user['user_type'],
                "firstName": user.get('first_name', ''),
                "lastName": user.get('last_name', '')
            }

            logger.debug("Login successful")
            return jsonify(response), 200

        logger.warning("Invalid credentials provided")
        return jsonify({"error": "Invalid credentials"}), 401

    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return jsonify({"error": "Login failed", "details": str(e)}), 500


@auth_routes.route('/register', methods=['POST'])
def register():
    try:
        logger = current_app.logger
        users = current_app.mongo.db.users

        logger.debug("Processing registration request")

        # Extract data from request
        data = request.get_json()
        if not data:
            logger.error("No JSON data in request")
            return jsonify({"error": "Missing request data"}), 400

        # Required fields
        required_fields = ['username', 'email', 'password', 'firstName',
                           'lastName', 'dateOfBirth', 'user_type']

        # Check if all required fields are present
        for field in required_fields:
            if field not in data:
                logger.error(f"Missing required field: {field}")
                return jsonify({"error": f"Missing required field: {field}"}), 400

        # Check if username or email already exists
        if users.find_one({"username": data['username']}):
            logger.warning("Username already exists")
            return jsonify({"error": "Username already exists"}), 400

        if users.find_one({"email": data['email']}):
            logger.warning("Email already exists")
            return jsonify({"error": "Email already exists"}), 400

        # Prepare user data
        user_data = {
            'username': data['username'],
            'email': data['email'],
            'password': generate_password_hash(data['password']),
            'first_name': data['firstName'],
            'last_name': data['lastName'],
            'date_of_birth': data['dateOfBirth'],
            'user_type': data['user_type'],
            'created_at': datetime.now(timezone.utc)
        }

        # Add default constants if they exist
        if hasattr(current_app, 'constants'):
            user_data.update(current_app.constants.DEFAULT_PATIENT_CONSTANTS)

        # Insert user
        user_id = users.insert_one(user_data).inserted_id
        logger.info(f"User registered successfully: {user_id}")

        return jsonify({
            "message": "User registered successfully",
            "id": str(user_id)
        }), 201

    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        return jsonify({"error": "Registration failed", "details": str(e)}), 500

