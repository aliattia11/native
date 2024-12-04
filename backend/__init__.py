from flask import Flask
from flask_cors import CORS
import logging
from config import mongo, logger


def create_app(config_name=None):
    """
    Application factory function that creates and configures the Flask app
    """
    # Initialize Flask app
    app = Flask(__name__)

    # Load configuration
    if config_name == 'testing':
        app.config.from_object('config.TestingConfig')
    else:
        app.config.update(
            MONGO_URI="mongodb://localhost:27017/native_new",
            SECRET_KEY='your_secret_key',
            APP_TIMEZONE='UTC',
            TOKEN_EXPIRY=24,  # hours
            ALLOWED_ORIGINS=["http://localhost:3000"]
        )

    # Configure CORS
    CORS(app, resources={r"/*": {"origins": app.config['ALLOWED_ORIGINS']}})

    # Configure logging
    logging.basicConfig(level=logging.DEBUG)
    app.logger = logging.getLogger(__name__)

    # Initialize MongoDB
    app.mongo = mongo

    return app