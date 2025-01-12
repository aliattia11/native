import os

# Define the base structure
base_structure = {
    "ML": {
        "models": [
            "insulin_optimizer.py",
            "pattern_detector.py",
            "prediction_model.py"
        ],
        "training": [
            "data_preprocessor.py",
            "model_trainer.py",
            "feature_engineering.py"
        ],
        "inference": [
            "recommendation_engine.py",
            "safety_validator.py",
            "explanation_generator.py"
        ],
        "monitoring": [
            "model_performance.py",
            "drift_detector.py"
        ]
    }
}

def create_structure(base_path, structure):
    for folder, content in structure.items():
        folder_path = os.path.join(base_path, folder)
        os.makedirs(folder_path, exist_ok=True)  # Create the folder
        if isinstance(content, dict):  # If the content is another dictionary, recurse
            create_structure(folder_path, content)
        elif isinstance(content, list):  # If the content is a list, create files
            for file_name in content:
                file_path = os.path.join(folder_path, file_name)
                with open(file_path, 'w') as f:
                    pass  # Create an empty file

# Base directory for your project
base_directory = os.path.join(os.getcwd(), "project")  # Replace 'project' with your desired project name
os.makedirs(base_directory, exist_ok=True)

# Create the folder and file structure
create_structure(base_directory, base_structure)

print(f"Folder and file structure created at: {base_directory}")
