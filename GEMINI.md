## Coding/documenting guidelines

* Create a file per feature or related features, split as much as possible in different files;
* add docstrings to all functions to explain what they do;
* start each file with a long comment explaining in detail what the feature is about and the different use cases;
* maintain a `Design.md` document at the root of the app that documents all the features of the app;
* log as info all function calls (with their parameters) and log all genai calls with all their parameters (model used, prompt, config) and their outputs, just strip inline data;
* group all configurable items (like model names) in a centralized file;
