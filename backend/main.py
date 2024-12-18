# main.py
from flask import Flask
import logging
from config import create_app_config, mongo
from constants import Constants
from pathlib import Path

def create_app():
    # Create Flask app
    app = Flask(__name__)

    # Set logging levels
    app.logger.setLevel(logging.INFO)  # Changed from DEBUG to INFO
    logging.getLogger('werkzeug').setLevel(logging.WARNING)  # Reduce Flask debug output
    logging.getLogger('pymongo').setLevel(logging.WARNING)  # Reduce MongoDB debug output

    # Initialize app with config
    app, _, logger = create_app_config(app)
    # Initialize Constants
    constants = Constants()
    app.constants = constants
    try:
        frontend_path = Path(__file__).parent.parent / 'frontend' / 'src' / 'constants' / 'shared_constants.js'
        Constants.export_constants_to_frontend(str(frontend_path))
        app.logger.info("Constants exported successfully")
    except Exception as e:
        app.logger.error(f"Error exporting constants: {e}")

    # Error handling setup
    @app.errorhandler(404)
    def not_found(error):
        return {"error": "Resource not found"}, 404

    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Internal server error: {str(error)}")
        return {"error": "Internal server error"}, 500

    try:
        # Import blueprints
        from routes.food_routes import food_routes
        from routes.auth_routes import auth_routes
        from routes.doctor_routes import doctor_routes
        from routes.patient_routes import patient_routes
        from routes.test_routes import test_routes
        from meal_insulin import meal_insulin_bp
        from activity import activity_bp
        from blood_sugar import blood_sugar_bp
        from medication_routes import medication_routes
        # Register blueprints
        blueprints = [
            (food_routes, ''),
            (auth_routes, ''),
            (doctor_routes, ''),
            (patient_routes, ''),
            (test_routes, ''),
            (meal_insulin_bp, ''),
            (activity_bp, ''),
            (blood_sugar_bp, ''),
            (medication_routes, ''),
        ]

        for blueprint, url_prefix in blueprints:
            app.register_blueprint(blueprint, url_prefix=url_prefix)
            logger.info(f"Registered blueprint: {blueprint.name}")

    except Exception as e:
        logger.error(f"Error registering blueprints: {str(e)}")
        raise

    return app

if __name__ == '__main__':
    app = create_app()
    app.logger.info("Starting Flask application...")
    app.run(debug=False, host='0.0.0.0', port=5000)