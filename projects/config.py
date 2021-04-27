from importlib.util import spec_from_file_location, module_from_spec


class Config:
    _config_singleton = None

    def __init__(self, path):
        # Load and parse the config file
        config_spec = spec_from_file_location('config', path)
        config = module_from_spec(config_spec)
        config_spec.loader.exec_module(config)

        # Set all config properties on this instance
        for key in config.__dict__:
            if key.isupper(): setattr(self, key, config.__dict__[key])

    @classmethod
    def load_config(cls, path='projects_config.py'):
        cls._config_singleton = Config(path)
        return cls._config_singleton

    @classmethod
    def instance(cls):
        if cls._config_singleton is None:
            raise RuntimeError('The config singleton has not yet been defined')
        else:
            return cls._config_singleton
