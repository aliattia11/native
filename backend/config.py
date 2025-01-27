from flask import Flask
from flask_pymongo import PyMongo
from flask_cors import CORS
import logging
from datetime import timezone, timedelta

# Initialize Flask app
app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)  # Changed from DEBUG to INFO
logger = logging.getLogger(__name__)

# Specifically set PyMongo logging to WARNING level
logging.getLogger('pymongo').setLevel(logging.WARNING)
logging.getLogger('mongodb').setLevel(logging.WARNING)
logging.getLogger('meal_insulin').setLevel(logging.DEBUG)

# Initialize MongoDB
mongo = PyMongo()

def create_app_config(app):
    # Update CORS configuration
    CORS(app, resources={
        r"/*": {  # Change from r"/api/*" to r"/*" to cover all routes
            "origins": ["http://localhost:3000"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "Accept"],
            "expose_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True,
            "max_age": 120
        }
    })

    # Configuration
    app.config.update(
        MONGO_URI="mongodb://localhost:27017/native_new",
        SECRET_KEY='your_secret_key',
        APP_TIMEZONE=timezone.utc,
        TOKEN_EXPIRY=timedelta(hours=24),
        ALLOWED_ORIGINS=["http://localhost:3000"]
    )

    # Initialize MongoDB with app
    mongo.init_app(app)

    # Make these accessible throughout the app
    app.mongo = mongo
    app.logger = logger

    return app, mongo, logger

# Export these for backward compatibility
def get_mongo():
    return mongo

def get_logger():
    return logger