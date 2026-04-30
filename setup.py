from warehousing import __version__ as version

setup(
	name="warehousing",
	version=version,
	description="Warehouse Management System",
	author="Alfian",
	author_email="alfian@example.com",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)