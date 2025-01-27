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

    # Configure logging
    logging.basicConfig(level=logging.INFO)  # Changed from DEBUG to INFO
    app.logger = logging.getLogger(__name__)
    # Set specific loggers to WARNING level
    logging.getLogger('pymongo').setLevel(logging.WARNING)
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.getLogger('mongodb').setLevel(logging.WARNING)


    # Configure logging
    logging.basicConfig(level=logging.DEBUG)
    app.logger = logging.getLogger(__name__)

    # Initialize MongoDB
    app.mongo = mongo

    return app